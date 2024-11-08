/* eslint-disable complexity */
import { isThenable, parseSemver } from '@sentry/utils';

import * as fs from 'fs';
import { sync as resolveSync } from 'resolve';
import type {
  ExportedNextConfig as NextConfig,
  NextConfigFunction,
  NextConfigObject,
  SentryBuildOptions,
} from './types';
import { constructWebpackConfigFunction } from './webpack';

let showedExportModeTunnelWarning = false;

/**
 * Modifies the passed in Next.js configuration with automatic build-time instrumentation and source map upload.
 *
 * @param nextConfig A Next.js configuration object, as usually exported in `next.config.js` or `next.config.mjs`.
 * @param sentryBuildOptions Additional options to configure instrumentation and
 * @returns The modified config to be exported
 */
// TODO(v9): Always return an async function here to allow us to do async things like grabbing a deterministic build ID.
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

// Modify the materialized object form of the user's next config by deleting the `sentry` property and wrapping the
// `webpack` property
function getFinalConfigObject(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): NextConfigObject {
  // TODO(v9): Remove this check for the Sentry property
  if ('sentry' in incomingUserNextConfigObject) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] Setting a `sentry` property on the Next.js config object as a means of configuration is no longer supported. Please use the `sentryBuildOptions` argument of of the `withSentryConfig()` function instead.',
    );

    // Next 12.2.3+ warns about non-canonical properties on `userNextConfig`.
    delete incomingUserNextConfigObject.sentry;
  }

  if (userSentryOptions?.tunnelRoute) {
    if (incomingUserNextConfigObject.output === 'export') {
      if (!showedExportModeTunnelWarning) {
        showedExportModeTunnelWarning = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@sentry/nextjs] The Sentry Next.js SDK `tunnelRoute` option will not work in combination with Next.js static exports. The `tunnelRoute` option uses serverside features that cannot be accessed in export mode. If you still want to tunnel Sentry events, set up your own tunnel: https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option',
        );
      }
    } else {
      setUpTunnelRewriteRules(incomingUserNextConfigObject, userSentryOptions.tunnelRoute);
    }
  }

  setUpBuildTimeVariables(incomingUserNextConfigObject, userSentryOptions);

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

  if (process.env.TURBOPACK && !process.env.SENTRY_SUPPRESS_TURBOPACK_WARNING) {
    // eslint-disable-next-line no-console
    console.warn(
      `[@sentry/nextjs] WARNING: You are using the Sentry SDK with \`next ${
        process.env.NODE_ENV === 'development' ? 'dev' : 'build'
      } --turbo\`. The Sentry SDK doesn't yet fully support Turbopack. The SDK will not be loaded in the browser, and serverside instrumentation will be inaccurate or incomplete. ${
        process.env.NODE_ENV === 'development' ? 'Production builds without `--turbo` will still fully work. ' : ''
      }If you are just trying out Sentry or attempting to configure the SDK, we recommend temporarily removing the \`--turbo\` flag while you are developing locally. Follow this issue for progress on Sentry + Turbopack: https://github.com/getsentry/sentry-javascript/issues/8105. (You can suppress this warning by setting SENTRY_SUPPRESS_TURBOPACK_WARNING=1 as environment variable)`,
    );
  }

  return {
    ...incomingUserNextConfigObject,
    webpack: constructWebpackConfigFunction(incomingUserNextConfigObject, userSentryOptions),
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

// TODO(v9): Inject the release into all the bundles. This is breaking because grabbing the build ID if the user provides
// it in `generateBuildId` (https://nextjs.org/docs/app/api-reference/next-config-js/generateBuildId) is async but we do
// not turn the next config function in the type it was passed.
function setUpBuildTimeVariables(userNextConfig: NextConfigObject, userSentryOptions: SentryBuildOptions): void {
  const assetPrefix = userNextConfig.assetPrefix || userNextConfig.basePath || '';
  const basePath = userNextConfig.basePath ?? '';
  const rewritesTunnelPath =
    userSentryOptions.tunnelRoute !== undefined && userNextConfig.output !== 'export'
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

  if (rewritesTunnelPath) {
    buildTimeVariables._sentryRewritesTunnelPath = rewritesTunnelPath;
  }

  if (basePath) {
    buildTimeVariables._sentryBasePath = basePath;
  }

  if (typeof userNextConfig.env === 'object') {
    userNextConfig.env = { ...buildTimeVariables, ...userNextConfig.env };
  } else if (userNextConfig.env === undefined) {
    userNextConfig.env = buildTimeVariables;
  }
}

function getNextjsVersion(): string | undefined {
  const nextjsPackageJsonPath = resolveNextjsPackageJson();
  if (nextjsPackageJsonPath) {
    try {
      const nextjsPackageJson: { version: string } = JSON.parse(
        fs.readFileSync(nextjsPackageJsonPath, { encoding: 'utf-8' }),
      );
      return nextjsPackageJson.version;
    } catch {
      // noop
    }
  }

  return undefined;
}

function resolveNextjsPackageJson(): string | undefined {
  try {
    return resolveSync('next/package.json', { basedir: process.cwd() });
  } catch {
    return undefined;
  }
}
