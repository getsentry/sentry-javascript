/* eslint-disable max-lines */
/* eslint-disable complexity */
import { isThenable, parseSemver } from '@sentry/core';
import { getSentryRelease } from '@sentry/node';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { handleRunAfterProductionCompile } from './handleRunAfterProductionCompile';
import { createRouteManifest } from './manifest/createRouteManifest';
import type { RouteManifest } from './manifest/types';
import { constructTurbopackConfig } from './turbopack';
import type {
  ExportedNextConfig as NextConfig,
  NextConfigFunction,
  NextConfigObject,
  SentryBuildOptions,
} from './types';
import { getNextjsVersion, supportsProductionCompileHook } from './util';
import { constructWebpackConfigFunction } from './webpack';

let showedExportModeTunnelWarning = false;
let showedExperimentalBuildModeWarning = false;

// Packages we auto-instrument need to be external for instrumentation to work
// Next.js externalizes some packages by default, see: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
// Others we need to add ourselves
//
// NOTE: 'ai' (Vercel AI SDK) is intentionally NOT included in this list.
// When externalized, Next.js doesn't properly handle the package's conditional exports,
// specifically the "react-server" export condition. This causes client-side code to be
// loaded in server components instead of the appropriate server-side functions.
export const DEFAULT_SERVER_EXTERNAL_PACKAGES = [
  'amqplib',
  'connect',
  'dataloader',
  'express',
  'generic-pool',
  'graphql',
  '@hapi/hapi',
  'ioredis',
  'kafkajs',
  'koa',
  'lru-memoizer',
  'mongodb',
  'mongoose',
  'mysql',
  'mysql2',
  'knex',
  'pg',
  'pg-pool',
  '@node-redis/client',
  '@redis/client',
  'redis',
  'tedious',
];

/**
 * Modifies the passed in Next.js configuration with automatic build-time instrumentation and source map upload.
 *
 * @param nextConfig A Next.js configuration object, as usually exported in `next.config.js` or `next.config.mjs`.
 * @param sentryBuildOptions Additional options to configure instrumentation and
 * @returns The modified config to be exported
 */
export function withSentryConfig<C>(nextConfig?: C, sentryBuildOptions: SentryBuildOptions = {}): C {
  const castNextConfig = (nextConfig as NextConfig) || {};
  if (typeof castNextConfig === 'function') {
    return function (this: unknown, ...webpackConfigFunctionArgs: unknown[]): ReturnType<NextConfigFunction> {
      const maybePromiseNextConfig: ReturnType<typeof castNextConfig> = castNextConfig.apply(
        this,
        webpackConfigFunctionArgs,
      );

      if (isThenable(maybePromiseNextConfig)) {
        return maybePromiseNextConfig.then(promiseResultNextConfig => {
          return getFinalConfigObject(promiseResultNextConfig, sentryBuildOptions);
        });
      }

      return getFinalConfigObject(maybePromiseNextConfig, sentryBuildOptions);
    } as C;
  } else {
    return getFinalConfigObject(castNextConfig, sentryBuildOptions) as C;
  }
}

/**
 * Generates a random tunnel route path that's less likely to be blocked by ad-blockers
 */
function generateRandomTunnelRoute(): string {
  // Generate a random 8-character alphanumeric string
  const randomString = Math.random().toString(36).substring(2, 10);
  return `/${randomString}`;
}

// Modify the materialized object form of the user's next config by deleting the `sentry` property and wrapping the
// `webpack` property
function getFinalConfigObject(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): NextConfigObject {
  // Only determine a release name if release creation is not explicitly disabled
  // This prevents injection of Git commit hashes that break build determinism
  const shouldCreateRelease = userSentryOptions.release?.create !== false;
  const releaseName = shouldCreateRelease
    ? (userSentryOptions.release?.name ?? getSentryRelease() ?? getGitRevision())
    : userSentryOptions.release?.name;

  if (userSentryOptions?.tunnelRoute) {
    if (incomingUserNextConfigObject.output === 'export') {
      if (!showedExportModeTunnelWarning) {
        showedExportModeTunnelWarning = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/nextjs] The Sentry Next.js SDK `tunnelRoute` option will not work in combination with Next.js static exports. The `tunnelRoute` option uses server-side features that cannot be accessed in export mode. If you still want to tunnel Sentry events, set up your own tunnel: https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option',
        );
      }
    } else {
      const resolvedTunnelRoute =
        userSentryOptions.tunnelRoute === true ? generateRandomTunnelRoute() : userSentryOptions.tunnelRoute;

      // Update the global options object to use the resolved value everywhere
      userSentryOptions.tunnelRoute = resolvedTunnelRoute || undefined;
      setUpTunnelRewriteRules(incomingUserNextConfigObject, resolvedTunnelRoute);
    }
  }

  if (process.argv.includes('--experimental-build-mode')) {
    if (!showedExperimentalBuildModeWarning) {
      showedExperimentalBuildModeWarning = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] The Sentry Next.js SDK does not currently fully support next build --experimental-build-mode',
      );
    }
    if (process.argv.includes('generate')) {
      // Next.js v15.3.0-canary.1 splits the experimental build into two phases:
      // 1. compile: Code compilation
      // 2. generate: Environment variable inlining and prerendering (We don't instrument this phase, we inline in the compile phase)
      //
      // We assume a single "full" build and reruns Webpack instrumentation in both phases.
      // During the generate step it collides with Next.js's inliner
      // producing malformed JS and build failures.
      // We skip Sentry processing during generate to avoid this issue.
      return incomingUserNextConfigObject;
    }
  }

  let routeManifest: RouteManifest | undefined;
  if (!userSentryOptions.disableManifestInjection) {
    routeManifest = createRouteManifest();
  }

  setUpBuildTimeVariables(incomingUserNextConfigObject, userSentryOptions, releaseName);

  const nextJsVersion = getNextjsVersion();

  // Add the `clientTraceMetadata` experimental option based on Next.js version. The option got introduced in Next.js version 15.0.0 (actually 14.3.0-canary.64).
  // Adding the option on lower versions will cause Next.js to print nasty warnings we wouldn't confront our users with.
  if (nextJsVersion) {
    const { major, minor } = parseSemver(nextJsVersion);
    if (major !== undefined && minor !== undefined && (major >= 15 || (major === 14 && minor >= 3))) {
      incomingUserNextConfigObject.experimental = incomingUserNextConfigObject.experimental || {};
      incomingUserNextConfigObject.experimental.clientTraceMetadata = [
        'baggage',
        'sentry-trace',
        ...(incomingUserNextConfigObject.experimental?.clientTraceMetadata || []),
      ];
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[@sentry/nextjs] The Sentry SDK was not able to determine your Next.js version. If you are using Next.js version 15 or greater, please add `experimental.clientTraceMetadata: ['sentry-trace', 'baggage']` to your Next.js config to enable pageload tracing for App Router.",
    );
  }

  // From Next.js version (15.0.0-canary.124) onwards, Next.js does no longer require the `experimental.instrumentationHook` option and will
  // print a warning when it is set, so we need to conditionally provide it for lower versions.
  if (nextJsVersion) {
    const { major, minor, patch, prerelease } = parseSemver(nextJsVersion);
    const isFullySupportedRelease =
      major !== undefined &&
      minor !== undefined &&
      patch !== undefined &&
      major >= 15 &&
      ((minor === 0 && patch === 0 && prerelease === undefined) || minor > 0 || patch > 0);
    const isSupportedV15Rc =
      major !== undefined &&
      minor !== undefined &&
      patch !== undefined &&
      prerelease !== undefined &&
      major === 15 &&
      minor === 0 &&
      patch === 0 &&
      prerelease.startsWith('rc.') &&
      parseInt(prerelease.split('.')[1] || '', 10) > 0;
    const isSupportedCanary =
      minor !== undefined &&
      patch !== undefined &&
      prerelease !== undefined &&
      major === 15 &&
      minor === 0 &&
      patch === 0 &&
      prerelease.startsWith('canary.') &&
      parseInt(prerelease.split('.')[1] || '', 10) >= 124;

    if (!isFullySupportedRelease && !isSupportedV15Rc && !isSupportedCanary) {
      if (incomingUserNextConfigObject.experimental?.instrumentationHook === false) {
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/nextjs] You turned off the `experimental.instrumentationHook` option. Note that Sentry will not be initialized if you did not set it up inside `instrumentation.(js|ts)`.',
        );
      }
      incomingUserNextConfigObject.experimental = {
        instrumentationHook: true,
        ...incomingUserNextConfigObject.experimental,
      };
    }
  } else {
    // If we cannot detect a Next.js version for whatever reason, the sensible default is to set the `experimental.instrumentationHook`, even though it may create a warning.
    if (
      incomingUserNextConfigObject.experimental &&
      'instrumentationHook' in incomingUserNextConfigObject.experimental
    ) {
      if (incomingUserNextConfigObject.experimental.instrumentationHook === false) {
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/nextjs] You set `experimental.instrumentationHook` to `false`. If you are using Next.js version 15 or greater, you can remove that option. If you are using Next.js version 14 or lower, you need to set `experimental.instrumentationHook` in your `next.config.(js|mjs)` to `true` for the SDK to be properly initialized in combination with `instrumentation.(js|ts)`.',
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "[@sentry/nextjs] The Sentry SDK was not able to determine your Next.js version. If you are using Next.js version 15 or greater, Next.js will probably show you a warning about the `experimental.instrumentationHook` being set. To silence Next.js' warning, explicitly set the `experimental.instrumentationHook` option in your `next.config.(js|mjs|ts)` to `undefined`. If you are on Next.js version 14 or lower, you can silence this particular warning by explicitly setting the `experimental.instrumentationHook` option in your `next.config.(js|mjs)` to `true`.",
      );
      incomingUserNextConfigObject.experimental = {
        instrumentationHook: true,
        ...incomingUserNextConfigObject.experimental,
      };
    }
  }

  // We wanna check whether the user added a `onRouterTransitionStart` handler to their client instrumentation file.
  const instrumentationClientFileContents = getInstrumentationClientFileContents();
  if (
    instrumentationClientFileContents !== undefined &&
    !instrumentationClientFileContents.includes('onRouterTransitionStart') &&
    !userSentryOptions.suppressOnRouterTransitionStartWarning
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] ACTION REQUIRED: To instrument navigations, the Sentry SDK requires you to export an `onRouterTransitionStart` hook from your `instrumentation-client.(js|ts)` file. You can do so by adding `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;` to the file.',
    );
  }

  let nextMajor: number | undefined;
  const isTurbopack = process.env.TURBOPACK;
  let isTurbopackSupported = false;
  if (nextJsVersion) {
    const { major, minor, patch, prerelease } = parseSemver(nextJsVersion);
    nextMajor = major;
    const isSupportedVersion =
      major !== undefined &&
      minor !== undefined &&
      patch !== undefined &&
      (major > 15 ||
        (major === 15 && minor > 3) ||
        (major === 15 && minor === 3 && patch === 0 && prerelease === undefined) ||
        (major === 15 && minor === 3 && patch > 0));
    isTurbopackSupported = isSupportedVersion;
    const isSupportedCanary =
      major !== undefined &&
      minor !== undefined &&
      patch !== undefined &&
      prerelease !== undefined &&
      major === 15 &&
      minor === 3 &&
      patch === 0 &&
      prerelease.startsWith('canary.') &&
      parseInt(prerelease.split('.')[1] || '', 10) >= 28;
    const supportsClientInstrumentation = isSupportedCanary || isSupportedVersion;

    if (!supportsClientInstrumentation && isTurbopack) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn(
          `[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack (\`next dev --turbo\`). The Sentry SDK is compatible with Turbopack on Next.js version 15.3.0 or later. You are currently on ${nextJsVersion}. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack. Note that the SDK will continue to work for non-Turbopack production builds. This warning is only about dev-mode.`,
        );
      } else if (process.env.NODE_ENV === 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `[@sentry/nextjs] WARNING: You are using the Sentry SDK with Turbopack (\`next build --turbo\`). The Sentry SDK is compatible with Turbopack on Next.js version 15.3.0 or later. You are currently on ${nextJsVersion}. Please upgrade to a newer Next.js version to use the Sentry SDK with Turbopack. Note that as Turbopack is still experimental for production builds, some of the Sentry SDK features like source maps will not work. Follow this issue for progress on Sentry + Turbopack: https://github.com/getsentry/sentry-javascript/issues/8105.`,
        );
      }
    }
  }

  if (userSentryOptions?.useRunAfterProductionCompileHook === true && supportsProductionCompileHook()) {
    if (incomingUserNextConfigObject?.compiler?.runAfterProductionCompile === undefined) {
      incomingUserNextConfigObject.compiler ??= {};
      incomingUserNextConfigObject.compiler.runAfterProductionCompile = async ({ distDir }) => {
        await handleRunAfterProductionCompile(
          { releaseName, distDir, buildTool: isTurbopack ? 'turbopack' : 'webpack' },
          userSentryOptions,
        );
      };
    } else if (typeof incomingUserNextConfigObject.compiler.runAfterProductionCompile === 'function') {
      incomingUserNextConfigObject.compiler.runAfterProductionCompile = new Proxy(
        incomingUserNextConfigObject.compiler.runAfterProductionCompile,
        {
          async apply(target, thisArg, argArray) {
            const { distDir }: { distDir: string } = argArray[0] ?? { distDir: '.next' };
            await target.apply(thisArg, argArray);
            await handleRunAfterProductionCompile(
              { releaseName, distDir, buildTool: isTurbopack ? 'turbopack' : 'webpack' },
              userSentryOptions,
            );
          },
        },
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] The configured `compiler.runAfterProductionCompile` option is not a function. Will not run source map and release management logic.',
      );
    }
  }

  // Enable source maps for turbopack builds
  if (isTurbopackSupported && isTurbopack && !userSentryOptions.sourcemaps?.disable) {
    // Only set if not already configured by user
    if (incomingUserNextConfigObject.productionBrowserSourceMaps === undefined) {
      if (userSentryOptions.debug) {
        // eslint-disable-next-line no-console
        console.log('[@sentry/nextjs] Automatically enabling browser source map generation for turbopack build.');
      }
      incomingUserNextConfigObject.productionBrowserSourceMaps = true;

      // Enable source map deletion if not explicitly disabled
      if (userSentryOptions.sourcemaps?.deleteSourcemapsAfterUpload === undefined) {
        if (userSentryOptions.debug) {
          // eslint-disable-next-line no-console
          console.warn(
            '[@sentry/nextjs] Source maps will be automatically deleted after being uploaded to Sentry. If you want to keep the source maps, set the `sourcemaps.deleteSourcemapsAfterUpload` option to false in `withSentryConfig()`. If you do not want to generate and upload sourcemaps at all, set the `sourcemaps.disable` option to true.',
          );
        }

        userSentryOptions.sourcemaps = {
          ...userSentryOptions.sourcemaps,
          deleteSourcemapsAfterUpload: true,
        };
      }
    }
  }

  return {
    ...incomingUserNextConfigObject,
    ...(nextMajor && nextMajor >= 15
      ? {
          serverExternalPackages: [
            ...(incomingUserNextConfigObject.serverExternalPackages || []),
            ...DEFAULT_SERVER_EXTERNAL_PACKAGES,
          ],
        }
      : {
          experimental: {
            ...incomingUserNextConfigObject.experimental,
            serverComponentsExternalPackages: [
              ...(incomingUserNextConfigObject.experimental?.serverComponentsExternalPackages || []),
              ...DEFAULT_SERVER_EXTERNAL_PACKAGES,
            ],
          },
        }),
    webpack:
      isTurbopack || userSentryOptions.disableSentryWebpackConfig
        ? incomingUserNextConfigObject.webpack // just return the original webpack config
        : constructWebpackConfigFunction({
            userNextConfig: incomingUserNextConfigObject,
            userSentryOptions,
            releaseName,
            routeManifest,
            nextJsVersion,
            useRunAfterProductionCompileHook: userSentryOptions?.useRunAfterProductionCompileHook,
          }),
    ...(isTurbopackSupported && isTurbopack
      ? {
          turbopack: constructTurbopackConfig({
            userNextConfig: incomingUserNextConfigObject,
            routeManifest,
            nextJsVersion,
          }),
        }
      : {}),
  };
}

/**
 * Injects rewrite rules into the Next.js config provided by the user to tunnel
 * requests from the `tunnelPath` to Sentry.
 *
 * See https://nextjs.org/docs/api-reference/next.config.js/rewrites.
 */
function setUpTunnelRewriteRules(userNextConfig: NextConfigObject, tunnelPath: string): void {
  const originalRewrites = userNextConfig.rewrites;

  // This function doesn't take any arguments at the time of writing but we future-proof
  // here in case Next.js ever decides to pass some
  userNextConfig.rewrites = async (...args: unknown[]) => {
    const tunnelRouteRewrite = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
      ],
      destination: 'https://o:orgid.ingest.sentry.io/api/:projectid/envelope/?hsts=0',
    };

    const tunnelRouteRewriteWithRegion = {
      // Matched rewrite routes will look like the following: `[tunnelPath]?o=[orgid]&p=[projectid]?r=[region]`
      // Nextjs will automatically convert `source` into a regex for us
      source: `${tunnelPath}(/?)`,
      has: [
        {
          type: 'query',
          key: 'o', // short for orgId - we keep it short so matching is harder for ad-blockers
          value: '(?<orgid>\\d*)',
        },
        {
          type: 'query',
          key: 'p', // short for projectId - we keep it short so matching is harder for ad-blockers
          value: '(?<projectid>\\d*)',
        },
        {
          type: 'query',
          key: 'r', // short for region - we keep it short so matching is harder for ad-blockers
          value: '(?<region>[a-z]{2})',
        },
      ],
      destination: 'https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/?hsts=0',
    };

    // Order of these is important, they get applied first to last.
    const newRewrites = [tunnelRouteRewriteWithRegion, tunnelRouteRewrite];

    if (typeof originalRewrites !== 'function') {
      return newRewrites;
    }

    // @ts-expect-error Expected 0 arguments but got 1 - this is from the future-proofing mentioned above, so we don't care about it
    const originalRewritesResult = await originalRewrites(...args);

    if (Array.isArray(originalRewritesResult)) {
      return [...newRewrites, ...originalRewritesResult];
    } else {
      return {
        ...originalRewritesResult,
        beforeFiles: [...newRewrites, ...(originalRewritesResult.beforeFiles || [])],
      };
    }
  };
}

function setUpBuildTimeVariables(
  userNextConfig: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
  releaseName: string | undefined,
): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';
  const basePath = userNextConfig.basePath ?? '';

  const rewritesTunnelPath =
    userSentryOptions.tunnelRoute !== undefined &&
    userNextConfig.output !== 'export' &&
    typeof userSentryOptions.tunnelRoute === 'string'
      ? `${basePath}${userSentryOptions.tunnelRoute}`
      : undefined;

  const buildTimeVariables: Record<string, string> = {
    // Make sure that if we have a windows path, the backslashes are interpreted as such (rather than as escape
    // characters)
    _sentryRewriteFramesDistDir: userNextConfig.distDir?.replace(/\\/g, '\\\\') || '.next',
    // Get the path part of `assetPrefix`, minus any trailing slash. (We use a placeholder for the origin if
    // `assetPrefix` doesn't include one. Since we only care about the path, it doesn't matter what it is.)
    _sentryRewriteFramesAssetPrefixPath: assetPrefix
      ? new URL(assetPrefix, 'http://dogs.are.great').pathname.replace(/\/$/, '')
      : '',
  };

  if (userNextConfig.assetPrefix) {
    buildTimeVariables._assetsPrefix = userNextConfig.assetPrefix;
  }

  if (userSentryOptions._experimental?.thirdPartyOriginStackFrames) {
    buildTimeVariables._experimentalThirdPartyOriginStackFrames = 'true';
  }

  if (rewritesTunnelPath) {
    buildTimeVariables._sentryRewritesTunnelPath = rewritesTunnelPath;
  }

  if (basePath) {
    buildTimeVariables._sentryBasePath = basePath;
  }

  if (userNextConfig.assetPrefix) {
    buildTimeVariables._sentryAssetPrefix = userNextConfig.assetPrefix;
  }

  if (userSentryOptions._experimental?.thirdPartyOriginStackFrames) {
    buildTimeVariables._experimentalThirdPartyOriginStackFrames = 'true';
  }

  if (releaseName) {
    buildTimeVariables._sentryRelease = releaseName;
  }

  if (typeof userNextConfig.env === 'object') {
    userNextConfig.env = { ...buildTimeVariables, ...userNextConfig.env };
  } else if (userNextConfig.env === undefined) {
    userNextConfig.env = buildTimeVariables;
  }
}

function getGitRevision(): string | undefined {
  let gitRevision: string | undefined;
  try {
    gitRevision = childProcess
      .execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // noop
  }
  return gitRevision;
}

function getInstrumentationClientFileContents(): string | void {
  const potentialInstrumentationClientFileLocations = [
    ['src', 'instrumentation-client.ts'],
    ['src', 'instrumentation-client.js'],
    ['instrumentation-client.ts'],
    ['instrumentation-client.js'],
  ];

  for (const pathSegments of potentialInstrumentationClientFileLocations) {
    try {
      return fs.readFileSync(path.join(process.cwd(), ...pathSegments), 'utf-8');
    } catch {
      // noop
    }
  }
}
