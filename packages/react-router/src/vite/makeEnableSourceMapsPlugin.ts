import { resolveSourceMapsFeatures } from '@sentry/core';
import type { Plugin, UserConfig } from 'vite';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * The Vite config key that tells the build end hook that the SDK turned on the source maps.
 */
export const SDK_ENABLED_SOURCE_MAPS_KEY = 'sentrySdkEnabledSourceMaps';

/**
 * A Sentry plugin for React Router to enable "hidden" source maps if they are unset.
 */
export function makeEnableSourceMapsPlugin(options: SentryReactRouterBuildOptions): Plugin {
  return {
    name: 'sentry-react-router-update-source-map-setting',
    apply: 'build',
    enforce: 'post',
    config(viteConfig) {
      const userSourceMap = viteConfig.build?.sourcemap;
      const sourcemap = getUpdatedSourceMapSettings(viteConfig, options);
      if (sourcemap === undefined) {
        return {};
      }
      return userSourceMap === undefined
        ? { build: { sourcemap }, [SDK_ENABLED_SOURCE_MAPS_KEY]: true }
        : { build: { sourcemap } };
    },
  };
}

/** There are 3 ways to set up source map generation
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - we won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline').
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *       - with `sourcemaps.delete: true`, switch `true` to 'hidden', because the maps are deleted
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation when Sentry uploads the maps, when
 *         `sourcemaps.delete: false` keeps them for a manual upload, or when `sourcemaps.disable`
 *         is set. Otherwise we leave it unset
 *       - delete all .map files after the upload (we emit a log about this)
 *
 * --> only exported for testing
 */
export function getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: SentryReactRouterBuildOptions,
): boolean | 'inline' | 'hidden' | undefined {
  viteConfig.build = viteConfig.build || {};

  const viteSourceMap = viteConfig?.build?.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';
  const debug = sentryPluginOptions?.debug;
  const { injectDebugIds, upload, legacyDisable } = resolveSourceMapsFeatures(sentryPluginOptions?.sourcemaps);
  const deleteOption = sentryPluginOptions?.sourcemaps?.delete;

  if (viteSourceMap === false) {
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // Longer debug message with more details
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Source map generation is currently disabled in your Vite configuration (\`${settingKey}: false \`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Source map generation is disabled in your Vite configuration.');
    }
  } else if (viteSourceMap === true && deleteOption === true) {
    // Without the `sourceMappingURL` comment browsers do not request the removed map files.
    updatedSourceMapSetting = 'hidden';

    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] Switched \`${settingKey}\` from \`true\` to \`'hidden'\` because \`sourcemaps.delete\` is set. The source maps will be removed from the build output.`,
      );
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    updatedSourceMapSetting = viteSourceMap;

    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
  } else if (
    // TODO(v12): Remove the `legacyDisable` case along with `sourcemaps.disable`.
    legacyDisable ||
    upload ||
    (deleteOption === false && injectDebugIds)
  ) {
    updatedSourceMapSetting = 'hidden';
    debug && //  eslint-disable-next-line no-console
      console.log(
        upload && deleteOption !== false
          ? `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps  will be deleted after they were uploaded to Sentry.`
          : `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps stay in the build output.`,
      );
  }

  return updatedSourceMapSetting;
}
