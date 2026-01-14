import { isMatchingPattern, parseSemver } from '@sentry/core';
import { getSentryRelease } from '@sentry/node';
import { createRouteManifest } from '../manifest/createRouteManifest';
import type { RouteManifest } from '../manifest/types';
import type { NextConfigObject, SentryBuildOptions } from '../types';
import { requiresInstrumentationHook } from '../util';
import { getGitRevision, getInstrumentationClientFileContents } from './buildTime';
import { resolveTunnelRoute, setUpTunnelRewriteRules } from './tunnel';

let showedExportModeTunnelWarning = false;
let showedExperimentalBuildModeWarning = false;

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
 * Applies tunnel-route rewrites, if configured.
 *
 * Note: this mutates `userSentryOptions` (to store the resolved tunnel route) and `incomingUserNextConfigObject`.
 */
export function maybeSetUpTunnelRouteRewriteRules(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): void {
  if (!userSentryOptions.tunnelRoute) {
    return;
  }

  if (incomingUserNextConfigObject.output === 'export') {
    if (!showedExportModeTunnelWarning) {
      showedExportModeTunnelWarning = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nextjs] The Sentry Next.js SDK `tunnelRoute` option will not work in combination with Next.js static exports. The `tunnelRoute` option uses server-side features that cannot be accessed in export mode. If you still want to tunnel Sentry events, set up your own tunnel: https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option',
      );
    }
    return;
  }

  // Update the global options object to use the resolved value everywhere
  const resolvedTunnelRoute = resolveTunnelRoute(userSentryOptions.tunnelRoute);
  userSentryOptions.tunnelRoute = resolvedTunnelRoute || undefined;

  setUpTunnelRewriteRules(incomingUserNextConfigObject, resolvedTunnelRoute);
}

/**
 * Handles Next's experimental build-mode warning/early return behavior.
 *
 * @returns `true` if Sentry config processing should be skipped for the current process invocation
 */
export function shouldReturnEarlyInExperimentalBuildMode(): boolean {
  if (!process.argv.includes('--experimental-build-mode')) {
    return false;
  }

  if (!showedExperimentalBuildModeWarning) {
    showedExperimentalBuildModeWarning = true;
    // eslint-disable-next-line no-console
    console.warn(
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
  // Handle deprecated option with warning
  // eslint-disable-next-line deprecation/deprecation
  if (userSentryOptions.disableManifestInjection) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] The `disableManifestInjection` option is deprecated. Use `routeManifestInjection: false` instead.',
    );
  }

  // If explicitly disabled, skip
  if (userSentryOptions.routeManifestInjection === false) {
    return undefined;
  }

  // Still check the deprecated option if the new option is not set
  // eslint-disable-next-line deprecation/deprecation
  if (userSentryOptions.routeManifestInjection === undefined && userSentryOptions.disableManifestInjection) {
    return undefined;
  }

  const manifest = createRouteManifest({
    basePath: incomingUserNextConfigObject.basePath,
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
    isrRoutes: manifest.isrRoutes.filter(r => !shouldExclude(r)),
  };
}

/**
 * Adds `experimental.clientTraceMetadata` for supported Next.js versions.
 */
export function maybeSetClientTraceMetadataOption(
  incomingUserNextConfigObject: NextConfigObject,
  nextJsVersion: string | undefined,
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
    // eslint-disable-next-line no-console
    console.log(
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
): void {
  // From Next.js version (15.0.0-canary.124) onwards, Next.js does no longer require the `experimental.instrumentationHook` option and will
  // print a warning when it is set, so we need to conditionally provide it for lower versions.
  if (nextJsVersion && requiresInstrumentationHook(nextJsVersion)) {
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
    return;
  }

  if (nextJsVersion) {
    return;
  }

  // If we cannot detect a Next.js version for whatever reason, the sensible default is to set the `experimental.instrumentationHook`, even though it may create a warning.
  if (incomingUserNextConfigObject.experimental && 'instrumentationHook' in incomingUserNextConfigObject.experimental) {
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
    // eslint-disable-next-line no-console
    console.warn(
      '[@sentry/nextjs] ACTION REQUIRED: To instrument navigations, the Sentry SDK requires you to export an `onRouterTransitionStart` hook from your `instrumentation-client.(js|ts)` file. You can do so by adding `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;` to the file.',
    );
  }
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
