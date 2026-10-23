import { debug, isMatchingPattern, parseSemver } from '@sentry/core';
import { getSentryRelease } from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';
import type { VercelCronsConfig } from '../../common/types';
import { getBuildLogger } from '../buildLogger';
import { createRouteManifest } from '../manifest/createRouteManifest';
import type { RouteManifest } from '../manifest/types';
import type { NextConfigObject, SentryBuildOptions } from '../types';
import { DEFAULT_PAGE_EXTENSIONS, requiresInstrumentationHook } from '../util';
import { getGitRevision, getInstrumentationClientFileContents } from './buildTime';
import {
  findTunnelRouteHandlerFile,
  resolveTunnelRoute,
  setUpTunnelHandlerRewrite,
  setUpTunnelRewriteRules,
} from './tunnel';

let showedExportModeTunnelWarning = false;
let showedUnusedTunnelRouteHandlerWarning = false;
let showedTunnelRouteHandlerModeLog = false;
let showedExperimentalBuildModeWarning = false;

const MISSING_INSTRUMENTATION_FILE_WARNING_SHOWN = '__SENTRY_MISSING_INSTRUMENTATION_FILE_WARNING_SHOWN__';

/**
 * Resolves the Sentry release name to use for build-time behavior.
 *
 * Note: if `release.create === false`, we avoid falling back to git to preserve build determinism.
 */
export function resolveReleaseName(userSentryOptions: SentryBuildOptions): string | undefined {
  const shouldCreateRelease = userSentryOptions.release?.create !== false;
  return shouldCreateRelease
    ? (userSentryOptions.release?.name ?? getSentryRelease() ?? getGitRevision())
    : userSentryOptions.release?.name;
}

/**
 * Applies tunnel-route rewrites, if configured. Uses handler mode if the project has a tunnel route handler file.
 *
 * Note: this mutates `userSentryOptions` (to store the resolved tunnel route) and `incomingUserNextConfigObject`.
 */
export function maybeSetUpTunnelRouteRewriteRules(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): void {
  if (userSentryOptions.tunnelRoute === undefined) {
    maybeWarnAboutUnusedTunnelRouteHandler(incomingUserNextConfigObject, userSentryOptions.silent);
    return;
  }

  if (!userSentryOptions.tunnelRoute) {
    return;
  }

  if (incomingUserNextConfigObject.output === 'export') {
    if (!showedExportModeTunnelWarning) {
      showedExportModeTunnelWarning = true;
      getBuildLogger(userSentryOptions.silent).warn(
        '[@sentry/nextjs] The Sentry Next.js SDK `tunnelRoute` option will not work in combination with Next.js static exports. The `tunnelRoute` option uses server-side features that cannot be accessed in export mode. If you still want to tunnel Sentry events, set up your own tunnel: https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option',
      );
    }
    return;
  }

  // Update the global options object to use the resolved value everywhere
  const resolvedTunnelRoute = resolveTunnelRoute(userSentryOptions.tunnelRoute);
  userSentryOptions.tunnelRoute = resolvedTunnelRoute || undefined;

  const tunnelRouteHandlerFile = findTunnelRouteHandlerFile(incomingUserNextConfigObject.pageExtensions);
  if (!tunnelRouteHandlerFile) {
    setUpTunnelRewriteRules(incomingUserNextConfigObject, resolvedTunnelRoute);
    return;
  }

  setUpTunnelHandlerRewrite(incomingUserNextConfigObject, resolvedTunnelRoute);

  if (!showedTunnelRouteHandlerModeLog) {
    showedTunnelRouteHandlerModeLog = true;
    getBuildLogger(userSentryOptions.silent).log(
      `[@sentry/nextjs] The tunnel route sends events through ${tunnelRouteHandlerFile}. Only the event payload goes to Sentry.`,
    );
  }
}

function maybeWarnAboutUnusedTunnelRouteHandler(
  incomingUserNextConfigObject: NextConfigObject,
  silent: boolean | undefined,
): void {
  if (showedUnusedTunnelRouteHandlerWarning || incomingUserNextConfigObject.output === 'export') {
    return;
  }

  const tunnelRouteHandlerFile = findTunnelRouteHandlerFile(incomingUserNextConfigObject.pageExtensions);
  if (!tunnelRouteHandlerFile) {
    return;
  }

  showedUnusedTunnelRouteHandlerWarning = true;
  getBuildLogger(silent).warn(
    `[@sentry/nextjs] Found ${tunnelRouteHandlerFile}, but the \`tunnelRoute\` option is not set. Set \`tunnelRoute\` in \`withSentryConfig\` to send events through this route.`,
  );
}

/**
 * Handles Next's experimental build-mode warning/early return behavior.
 *
 * @returns `true` if Sentry config processing should be skipped for the current process invocation
 */
export function shouldReturnEarlyInExperimentalBuildMode(silent?: boolean): boolean {
  if (!process.argv.includes('--experimental-build-mode')) {
    return false;
  }

  if (!showedExperimentalBuildModeWarning) {
    showedExperimentalBuildModeWarning = true;
    getBuildLogger(silent).warn(
      '[@sentry/nextjs] The Sentry Next.js SDK does not currently fully support next build --experimental-build-mode',
    );
  }

  // Next.js v15.3.0-canary.1 splits the experimental build into two phases:
  // 1. compile: Code compilation
  // 2. generate: Environment variable inlining and prerendering (We don't instrument this phase, we inline in the compile phase)
  //
  // We assume a single "full" build and reruns Webpack instrumentation in both phases.
  // During the generate step it collides with Next.js's inliner
  // producing malformed JS and build failures.
  // We skip Sentry processing during generate to avoid this issue.
  return process.argv.includes('generate');
}

/**
 * Creates the route manifest used for client-side route name normalization, unless disabled.
 */
export function maybeCreateRouteManifest(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): RouteManifest | undefined {
  if (userSentryOptions.routeManifestInjection === false) {
    return undefined;
  }

  const manifest = createRouteManifest({
    basePath: incomingUserNextConfigObject.basePath,
    localeParamNames: userSentryOptions.routeManifestInjection?.localeParamNames,
    silent: userSentryOptions.silent,
  });

  // Apply route exclusion filter if configured
  const excludeFilter = userSentryOptions.routeManifestInjection?.exclude;
  return filterRouteManifest(manifest, excludeFilter);
}

type ExcludeFilter = ((route: string) => boolean) | (string | RegExp)[] | undefined;

/**
 * Filters routes from the manifest based on the exclude filter.
 * (Exported only for testing)
 */
export function filterRouteManifest(manifest: RouteManifest, excludeFilter: ExcludeFilter): RouteManifest {
  if (!excludeFilter) {
    return manifest;
  }

  const shouldExclude = (route: string): boolean => {
    if (typeof excludeFilter === 'function') {
      return excludeFilter(route);
    }

    return excludeFilter.some(pattern => isMatchingPattern(route, pattern));
  };

  return {
    staticRoutes: manifest.staticRoutes.filter(r => !shouldExclude(r.path)),
    dynamicRoutes: manifest.dynamicRoutes.filter(r => !shouldExclude(r.path)),
  };
}

/**
 * Adds `experimental.clientTraceMetadata` for supported Next.js versions.
 */
export function maybeSetClientTraceMetadataOption(
  incomingUserNextConfigObject: NextConfigObject,
  nextJsVersion: string | undefined,
  silent?: boolean,
): void {
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
    getBuildLogger(silent).log(
      "[@sentry/nextjs] The Sentry SDK was not able to determine your Next.js version. If you are using Next.js version 15 or greater, please add `experimental.clientTraceMetadata: ['sentry-trace', 'baggage']` to your Next.js config to enable pageload tracing for App Router.",
    );
  }
}

/**
 * Ensures Next.js' `experimental.instrumentationHook` is set for versions which require it.
 */
export function maybeSetInstrumentationHookOption(
  incomingUserNextConfigObject: NextConfigObject,
  nextJsVersion: string | undefined,
  silent?: boolean,
): void {
  const logger = getBuildLogger(silent);

  // From Next.js version (15.0.0-canary.124) onwards, Next.js does no longer require the `experimental.instrumentationHook` option and will
  // print a warning when it is set, so we need to conditionally provide it for lower versions.
  if (nextJsVersion && requiresInstrumentationHook(nextJsVersion)) {
    if (incomingUserNextConfigObject.experimental?.instrumentationHook === false) {
      logger.warn(
        '[@sentry/nextjs] You turned off the `experimental.instrumentationHook` option. Note that Sentry will not be initialized if you did not set it up inside `instrumentation.(js|ts)`.',
      );
    }
    incomingUserNextConfigObject.experimental = {
      instrumentationHook: true,
      ...incomingUserNextConfigObject.experimental,
    };
    return;
  }

  if (nextJsVersion) {
    return;
  }

  // If we cannot detect a Next.js version for whatever reason, the sensible default is to set the `experimental.instrumentationHook`, even though it may create a warning.
  if (incomingUserNextConfigObject.experimental && 'instrumentationHook' in incomingUserNextConfigObject.experimental) {
    if (incomingUserNextConfigObject.experimental.instrumentationHook === false) {
      logger.warn(
        '[@sentry/nextjs] You set `experimental.instrumentationHook` to `false`. If you are using Next.js version 15 or greater, you can remove that option. If you are using Next.js version 14 or lower, you need to set `experimental.instrumentationHook` in your `next.config.(js|mjs)` to `true` for the SDK to be properly initialized in combination with `instrumentation.(js|ts)`.',
      );
    }
  } else {
    logger.log(
      "[@sentry/nextjs] The Sentry SDK was not able to determine your Next.js version. If you are using Next.js version 15 or greater, Next.js will probably show you a warning about the `experimental.instrumentationHook` being set. To silence Next.js' warning, explicitly set the `experimental.instrumentationHook` option in your `next.config.(js|mjs|ts)` to `undefined`. If you are on Next.js version 14 or lower, you can silence this particular warning by explicitly setting the `experimental.instrumentationHook` option in your `next.config.(js|mjs)` to `true`.",
    );
    incomingUserNextConfigObject.experimental = {
      instrumentationHook: true,
      ...incomingUserNextConfigObject.experimental,
    };
  }
}

/**
 * Warns if the project has an `instrumentation-client` file but doesn't export `onRouterTransitionStart`.
 */
export function warnIfMissingOnRouterTransitionStartHook(userSentryOptions: SentryBuildOptions): void {
  // We wanna check whether the user added a `onRouterTransitionStart` handler to their client instrumentation file.
  const instrumentationClientFileContents = getInstrumentationClientFileContents();
  if (
    instrumentationClientFileContents !== undefined &&
    !instrumentationClientFileContents.includes('onRouterTransitionStart') &&
    !userSentryOptions.suppressOnRouterTransitionStartWarning
  ) {
    getBuildLogger(userSentryOptions.silent).warn(
      '[@sentry/nextjs] ACTION REQUIRED: To instrument navigations, the Sentry SDK requires you to export an `onRouterTransitionStart` hook from your `instrumentation-client.(js|ts)` file. You can do so by adding `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;` to the file.',
    );
  }
}

/**
 * Warns if there is no `instrumentation` file next to the `app` or `pages` directory.
 * `next build` only looks there, even though dev and Turbopack also find the file in other places.
 */
export function warnIfMissingInstrumentationFile(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): void {
  if (
    process.env[MISSING_INSTRUMENTATION_FILE_WARNING_SHOWN] ||
    process.env.SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING
  ) {
    return;
  }

  const projectDir = process.cwd();
  const exists = (relativePath: string): boolean => fs.existsSync(path.join(projectDir, relativePath));

  // Same order as Next.js' `findPagesDir`
  const routerDir = ['pages', path.join('src', 'pages'), 'app', path.join('src', 'app')].find(exists);
  if (!routerDir) {
    return;
  }

  const instrumentationDir = path.dirname(routerDir);
  const pageExtensions = incomingUserNextConfigObject.pageExtensions ?? DEFAULT_PAGE_EXTENSIONS;
  if (pageExtensions.some(extension => exists(path.join(instrumentationDir, `instrumentation.${extension}`)))) {
    return;
  }

  // Next.js may evaluate its config in child processes, which inherit this state from their parent.
  process.env[MISSING_INSTRUMENTATION_FILE_WARNING_SHOWN] = '1';
  getBuildLogger(userSentryOptions.silent).warn(
    `[@sentry/nextjs] Could not find an instrumentation file next to your ${routerDir} directory. Next.js production builds only load it from there, so the Sentry SDK will not be initialized on the server. Create ${path.join(instrumentationDir, 'instrumentation.ts')}, or move your existing instrumentation file there: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#register-server-side-sdk (you can suppress this warning by setting SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING=1 as environment variable)`,
  );
}

/**
 * Parses the major Next.js version number from a semver string.
 */
export function getNextMajor(nextJsVersion: string | undefined): number | undefined {
  if (!nextJsVersion) {
    return undefined;
  }

  const { major } = parseSemver(nextJsVersion);
  return major;
}

/**
 * Reads the Vercel crons configuration from vercel.json.
 * Returns undefined if vercel.json doesn't exist or doesn't contain crons.
 */
function readVercelCronsConfig(): VercelCronsConfig {
  try {
    const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
    const vercelJsonContents = fs.readFileSync(vercelJsonPath, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const cronsConfig = JSON.parse(vercelJsonContents).crons as VercelCronsConfig;

    if (cronsConfig && Array.isArray(cronsConfig) && cronsConfig.length > 0) {
      return cronsConfig;
    }
    return undefined;
  } catch (e) {
    if ((e as { code: string }).code === 'ENOENT') {
      return undefined;
    }
    debug.error('[@sentry/nextjs] Failed to read vercel.json for automatic cron job monitoring instrumentation', e);
    return undefined;
  }
}

/** Strategy for Vercel cron monitoring instrumentation */
export type VercelCronsStrategy = 'spans' | 'wrapper';

export type VercelCronsConfigResult = {
  /** The crons configuration from vercel.json, if available */
  config: VercelCronsConfig;
  /**
   * The instrumentation strategy to use:
   * - `spans`: New span-based approach (works for both App Router and Pages Router)
   * - `wrapper`: Old wrapper-based approach (Pages Router only)
   * - `undefined`: No cron monitoring enabled
   */
  strategy: VercelCronsStrategy | undefined;
};

/**
 * Reads and returns the Vercel crons configuration from vercel.json along with
 * information about which instrumentation approach to use.
 *
 * - `_experimental.vercelCronsMonitoring`: New span-based approach (works for both App Router and Pages Router)
 * - `webpack.automaticVercelMonitors`: Old wrapper-based approach (Pages Router only)
 *
 * If both are enabled, the new approach is preferred and a warning is logged.
 */
export function maybeGetVercelCronsConfig(userSentryOptions: SentryBuildOptions): VercelCronsConfigResult {
  const result: VercelCronsConfigResult = { config: undefined, strategy: undefined };

  if (!process.env.VERCEL) {
    return result;
  }

  const experimentalEnabled = userSentryOptions._experimental?.vercelCronsMonitoring === true;
  const legacyEnabled = userSentryOptions.webpack?.automaticVercelMonitors === true;

  if (!experimentalEnabled && !legacyEnabled) {
    return result;
  }

  const config = readVercelCronsConfig();
  if (!config) {
    return result;
  }

  result.config = config;

  if (experimentalEnabled && legacyEnabled) {
    debug.warn(
      "[@sentry/nextjs] Both '_experimental.vercelCronsMonitoring' and 'webpack.automaticVercelMonitors' are enabled. " +
        "Using the new span-based approach from '_experimental.vercelCronsMonitoring'. " +
        "You can remove 'webpack.automaticVercelMonitors' from your config.",
    );
    result.strategy = 'spans';
  } else if (experimentalEnabled) {
    debug.log(
      '[@sentry/nextjs] Creating Sentry cron monitors for your Vercel Cron Jobs using span-based instrumentation.',
    );
    result.strategy = 'spans';
  } else {
    debug.log(
      "[@sentry/nextjs] Creating Sentry cron monitors for your Vercel Cron Jobs. You can disable this feature by setting the 'webpack.automaticVercelMonitors' option to false in your Next.js config.",
    );
    result.strategy = 'wrapper';
  }

  return result;
}
