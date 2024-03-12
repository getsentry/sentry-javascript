import type {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  SentryBuildOptions,
  WebpackConfigObject,
  WebpackConfigObjectWithModuleRules,
} from '../../src/config/types';
import { constructWebpackConfigFunction } from '../../src/config/webpack';
import { withSentryConfig } from '../../src/config/withSentryConfig';
import { defaultRuntimePhase, defaultsObject } from './fixtures';

/**
 * Derive the final values of all next config options, by first applying `withSentryConfig` and then, if it returns a
 *  function, running that function.
 *
 * @param exportedNextConfig Next config options provided by the user
 * @param userSentryWebpackPluginConfig SentryWebpackPlugin options provided by the user
 *
 * @returns The config values next will receive directly from `withSentryConfig` or when it calls the function returned
 * by `withSentryConfig`
 */
export function materializeFinalNextConfig(
  exportedNextConfig: ExportedNextConfig,
  runtimePhase?: string,
  sentryBuildOptions?: SentryBuildOptions,
): NextConfigObject {
  const sentrifiedConfig = withSentryConfig(exportedNextConfig, sentryBuildOptions);
  let finalConfigValues = sentrifiedConfig;

  if (typeof sentrifiedConfig === 'function') {
    // for some reason TS won't recognize that `finalConfigValues` is now a NextConfigObject, which is why the cast
    // below is necessary
    finalConfigValues = sentrifiedConfig(runtimePhase ?? defaultRuntimePhase, defaultsObject) as NextConfigObject;
  }

  return finalConfigValues as NextConfigObject;
}

/**
 * Derive the final values of all webpack config options, by first applying `constructWebpackConfigFunction` and then
 * running the resulting function. Since the `entry` property of the resulting object is itself a function, also call
 * that.
 *
 * @param options An object including the following:
 *   - `exportedNextConfig` Next config options provided by the user
 *   - `userSentryWebpackPluginConfig` SentryWebpackPlugin options provided by the user
 *   - `incomingWebpackConfig` The existing webpack config, passed to the function as `config`
 *   - `incomingWebpackBuildContext` The existing webpack build context, passed to the function as `options`
 *
 * @returns The webpack config values next will use when it calls the function that `createFinalWebpackConfig` returns
 */
export async function materializeFinalWebpackConfig(options: {
  exportedNextConfig: ExportedNextConfig;
  incomingWebpackConfig: WebpackConfigObject;
  incomingWebpackBuildContext: BuildContext;
  sentryBuildTimeOptions?: SentryBuildOptions;
}): Promise<WebpackConfigObjectWithModuleRules> {
  const { exportedNextConfig, incomingWebpackConfig, incomingWebpackBuildContext } = options;

  // if the user's next config is a function, run it so we have access to the values
  const materializedUserNextConfig =
    typeof exportedNextConfig === 'function'
      ? await exportedNextConfig('phase-production-build', defaultsObject)
      : exportedNextConfig;

  // get the webpack config function we'd normally pass back to next
  const webpackConfigFunction = constructWebpackConfigFunction(
    materializedUserNextConfig,
    options.sentryBuildTimeOptions,
  );

  // call it to get concrete values for comparison
  const finalWebpackConfigValue = webpackConfigFunction(incomingWebpackConfig, incomingWebpackBuildContext);
  const webpackEntryProperty = finalWebpackConfigValue.entry as EntryPropertyFunction;
  finalWebpackConfigValue.entry = await webpackEntryProperty();

  return finalWebpackConfigValue as WebpackConfigObjectWithModuleRules;
}
