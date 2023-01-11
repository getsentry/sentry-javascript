import type { WebpackPluginInstance } from 'webpack';

import type {
  BuildContext,
  EntryPropertyFunction,
  ExportedNextConfig,
  NextConfigObject,
  SentryWebpackPluginOptions,
  WebpackConfigObject,
  WebpackConfigObjectWithModuleRules,
} from '../../src/config/types';
import type { SentryWebpackPlugin } from '../../src/config/webpack';
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
  userSentryWebpackPluginConfig?: Partial<SentryWebpackPluginOptions>,
  runtimePhase?: string,
): NextConfigObject {
  const sentrifiedConfig = withSentryConfig(exportedNextConfig, userSentryWebpackPluginConfig);
  let finalConfigValues = sentrifiedConfig;

  if (typeof sentrifiedConfig === 'function') {
    // for some reason TS won't recognize that `finalConfigValues` is now a NextConfigObject, which is why the cast
    // below is necessary
    finalConfigValues = sentrifiedConfig(runtimePhase ?? defaultRuntimePhase, defaultsObject);
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
  userSentryWebpackPluginConfig?: Partial<SentryWebpackPluginOptions>;
  incomingWebpackConfig: WebpackConfigObject;
  incomingWebpackBuildContext: BuildContext;
}): Promise<WebpackConfigObjectWithModuleRules> {
  const { exportedNextConfig, userSentryWebpackPluginConfig, incomingWebpackConfig, incomingWebpackBuildContext } =
    options;

  // if the user's next config is a function, run it so we have access to the values
  const materializedUserNextConfig =
    typeof exportedNextConfig === 'function'
      ? exportedNextConfig('phase-production-build', defaultsObject)
      : exportedNextConfig;

  // extract the `sentry` property as we do in `withSentryConfig`
  const { sentry: sentryConfig } = materializedUserNextConfig;
  delete materializedUserNextConfig.sentry;

  // get the webpack config function we'd normally pass back to next
  const webpackConfigFunction = constructWebpackConfigFunction(
    materializedUserNextConfig,
    userSentryWebpackPluginConfig,
    sentryConfig,
  );

  // call it to get concrete values for comparison
  const finalWebpackConfigValue = webpackConfigFunction(incomingWebpackConfig, incomingWebpackBuildContext);
  const webpackEntryProperty = finalWebpackConfigValue.entry as EntryPropertyFunction;
  finalWebpackConfigValue.entry = await webpackEntryProperty();

  return finalWebpackConfigValue as WebpackConfigObjectWithModuleRules;
}

// helper function to make sure we're checking the correct plugin's data

/**
 * Given a webpack config, find a plugin (or the plugins) with the given name.
 *
 * Note that this function will error if more than one instance is found, unless the `allowMultiple` flag is passed.
 *
 * @param webpackConfig The webpack config object
 * @param pluginName The name of the plugin's constructor
 * @returns The plugin instance(s), or undefined if it's not found.
 */
export function findWebpackPlugin(
  webpackConfig: WebpackConfigObject,
  pluginName: string,
  multipleAllowed: boolean = false,
): WebpackPluginInstance | SentryWebpackPlugin | WebpackPluginInstance[] | SentryWebpackPlugin[] | undefined {
  const plugins = webpackConfig.plugins || [];
  const matchingPlugins = plugins.filter(plugin => plugin.constructor.name === pluginName);

  if (matchingPlugins.length > 1 && !multipleAllowed) {
    throw new Error(
      `More than one ${pluginName} instance found. Please use the \`multipleAllowed\` flag if this is intentional.\nExisting plugins: ${plugins.map(
        plugin => plugin.constructor.name,
      )}`,
    );
  }

  if (matchingPlugins.length > 0) {
    return multipleAllowed ? matchingPlugins : matchingPlugins[0];
  }

  return undefined;
}
