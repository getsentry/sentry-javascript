import type { NextConfigObject, SentryBuildOptions } from '../types';
import { getNextjsVersion } from '../util';
import { setUpBuildTimeVariables } from './buildTime';
import { migrateDeprecatedWebpackOptions } from './deprecatedWebpackOptions';
import {
  getBundlerInfo,
  getServerExternalPackagesPatch,
  getTurbopackPatch,
  getWebpackPatch,
  maybeConstructTurbopackConfig,
  maybeEnableTurbopackSourcemaps,
  maybeSetUpRunAfterProductionCompileHook,
  maybeWarnAboutUnsupportedRunAfterProductionCompileHook,
  maybeWarnAboutUnsupportedTurbopack,
  resolveUseRunAfterProductionCompileHookOption,
} from './getFinalConfigObjectBundlerUtils';
import {
  getNextMajor,
  maybeCreateRouteManifest,
  maybeSetClientTraceMetadataOption,
  maybeSetInstrumentationHookOption,
  maybeSetUpTunnelRouteRewriteRules,
  resolveReleaseName,
  shouldReturnEarlyInExperimentalBuildMode,
  warnIfMissingOnRouterTransitionStartHook,
} from './getFinalConfigObjectUtils';

/**
 * Materializes the final Next.js config object with Sentry's build-time integrations applied.
 *
 * Note: this mutates both `incomingUserNextConfigObject` and `userSentryOptions` (to apply defaults/migrations).
 */
export function getFinalConfigObject(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): NextConfigObject {
  migrateDeprecatedWebpackOptions(userSentryOptions);
  const releaseName = resolveReleaseName(userSentryOptions);

  maybeSetUpTunnelRouteRewriteRules(incomingUserNextConfigObject, userSentryOptions);

  if (shouldReturnEarlyInExperimentalBuildMode()) {
    return incomingUserNextConfigObject;
  }

  const routeManifest = maybeCreateRouteManifest(incomingUserNextConfigObject, userSentryOptions);
  setUpBuildTimeVariables(incomingUserNextConfigObject, userSentryOptions, releaseName);

  const nextJsVersion = getNextjsVersion();
  const nextMajor = getNextMajor(nextJsVersion);

  maybeSetClientTraceMetadataOption(incomingUserNextConfigObject, nextJsVersion);
  maybeSetInstrumentationHookOption(incomingUserNextConfigObject, nextJsVersion);
  warnIfMissingOnRouterTransitionStartHook(userSentryOptions);

  const bundlerInfo = getBundlerInfo(nextJsVersion);
  maybeWarnAboutUnsupportedTurbopack(nextJsVersion, bundlerInfo);
  maybeWarnAboutUnsupportedRunAfterProductionCompileHook(nextJsVersion, userSentryOptions, bundlerInfo);

  const turboPackConfig = maybeConstructTurbopackConfig(
    incomingUserNextConfigObject,
    userSentryOptions,
    routeManifest,
    nextJsVersion,
    bundlerInfo,
  );

  const shouldUseRunAfterProductionCompileHook = resolveUseRunAfterProductionCompileHookOption(
    userSentryOptions,
    bundlerInfo,
  );

  maybeSetUpRunAfterProductionCompileHook({
    incomingUserNextConfigObject,
    userSentryOptions,
    releaseName,
    nextJsVersion,
    bundlerInfo,
    turboPackConfig,
    shouldUseRunAfterProductionCompileHook,
  });

  maybeEnableTurbopackSourcemaps(incomingUserNextConfigObject, userSentryOptions, bundlerInfo);

  return {
    ...incomingUserNextConfigObject,
    ...getServerExternalPackagesPatch(incomingUserNextConfigObject, nextMajor),
    ...getWebpackPatch({
      incomingUserNextConfigObject,
      userSentryOptions,
      releaseName,
      routeManifest,
      nextJsVersion,
      shouldUseRunAfterProductionCompileHook,
      bundlerInfo,
    }),
    ...getTurbopackPatch(bundlerInfo, turboPackConfig),
  };
}
