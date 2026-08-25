import type { NextConfigObject, SentryBuildOptions } from '../types';
import { getNextjsVersion } from '../util';
import { setUpBuildTimeVariables } from './buildTime';
import {
  getBundlerInfo,
  getServerExternalPackagesPatch,
  getTurbopackPatch,
  getWebpackPatch,
  maybeConstructTurbopackConfig,
  maybeEnableTurbopackSourcemaps,
  maybeSetUpRunAfterProductionCompileHook,
  maybeWarnAboutUnsupportedRunAfterProductionCompileHook,
  maybeWarnAboutTurbopackModuleMetadata,
  maybeWarnAboutUnsupportedTurbopack,
  resolveBuildTimeInstrumentationOption,
  resolveUseRunAfterProductionCompileHookOption,
} from './getFinalConfigObjectBundlerUtils';
import {
  getNextMajor,
  maybeCreateRouteManifest,
  maybeGetVercelCronsConfig,
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
 * Note: this mutates both `incomingUserNextConfigObject` and `userSentryOptions` (to apply defaults).
 */
export function getFinalConfigObject(
  incomingUserNextConfigObject: NextConfigObject,
  userSentryOptions: SentryBuildOptions,
): NextConfigObject {
  const releaseName = resolveReleaseName(userSentryOptions);

  maybeSetUpTunnelRouteRewriteRules(incomingUserNextConfigObject, userSentryOptions);

  if (shouldReturnEarlyInExperimentalBuildMode()) {
    return incomingUserNextConfigObject;
  }

  const routeManifest = maybeCreateRouteManifest(incomingUserNextConfigObject, userSentryOptions);
  const vercelCronsConfigResult = maybeGetVercelCronsConfig(userSentryOptions);
  setUpBuildTimeVariables(incomingUserNextConfigObject, userSentryOptions, releaseName);

  const nextJsVersion = getNextjsVersion();
  const nextMajor = getNextMajor(nextJsVersion);

  maybeSetClientTraceMetadataOption(incomingUserNextConfigObject, nextJsVersion);
  maybeSetInstrumentationHookOption(incomingUserNextConfigObject, nextJsVersion);
  warnIfMissingOnRouterTransitionStartHook(userSentryOptions);

  const bundlerInfo = getBundlerInfo(nextJsVersion);
  maybeWarnAboutUnsupportedTurbopack(nextJsVersion, bundlerInfo);
  maybeWarnAboutTurbopackModuleMetadata(userSentryOptions, bundlerInfo);
  maybeWarnAboutUnsupportedRunAfterProductionCompileHook(nextJsVersion, userSentryOptions, bundlerInfo);

  const turboPackConfig = maybeConstructTurbopackConfig(
    incomingUserNextConfigObject,
    userSentryOptions,
    routeManifest,
    nextJsVersion,
    bundlerInfo,
    vercelCronsConfigResult,
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

  const buildTimeInstrumentation = resolveBuildTimeInstrumentationOption(userSentryOptions, bundlerInfo, nextJsVersion);

  return {
    ...incomingUserNextConfigObject,
    ...getServerExternalPackagesPatch(incomingUserNextConfigObject, nextMajor, buildTimeInstrumentation),
    ...getWebpackPatch({
      incomingUserNextConfigObject,
      userSentryOptions,
      releaseName,
      routeManifest,
      nextJsVersion,
      shouldUseRunAfterProductionCompileHook,
      bundlerInfo,
      vercelCronsConfigResult,
    }),
    ...getTurbopackPatch(bundlerInfo, turboPackConfig),
  };
}
