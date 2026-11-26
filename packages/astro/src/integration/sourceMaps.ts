import { hasSourceMapUploadCredentials } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures } from '@sentry/core';
import type { AstroConfig, AstroIntegrationLogger } from 'astro';
import type { SentryOptions } from './types';

/**
 * Whether the user enabled (true, 'hidden', 'inline') or disabled (false) source maps
 */
export type UserSourceMapSetting = 'enabled' | 'disabled' | 'unset' | undefined;

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-javascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline') or set `sourcemap` in the output options.
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation when Sentry can upload the maps, or when
 *         `sourcemaps.delete: false` keeps them for a manual upload. Otherwise we leave it unset
 *       - we remove the maps from the build output, except in a Cloudflare `_worker.js` folder and
 *         with `sourcemaps.delete: false`
 *
 * --> only exported for testing
 */
export function _getUpdatedSourceMapSettings(
  astroConfig: AstroConfig,
  sentryOptions: SentryOptions | undefined,
  logger: AstroIntegrationLogger,
): {
  previousUserSourceMapSetting: UserSourceMapSetting;
  updatedSourceMapSetting: boolean | 'inline' | 'hidden' | undefined;
} {
  let previousUserSourceMapSetting: UserSourceMapSetting = undefined;

  astroConfig.build = astroConfig.build || {};

  const viteSourceMap = astroConfig?.vite?.build?.sourcemap;
  const outputSourceMapSettings = getOutputSourceMapSettings(astroConfig?.vite?.build);
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'vite.build.sourcemap';
  const debug = sentryOptions?.debug;

  if (viteSourceMap === false) {
    previousUserSourceMapSetting = 'disabled';
    updatedSourceMapSetting = viteSourceMap;

    if (debug) {
      // Longer debug message with more details
      logger.warn(
        `Source map generation is currently disabled in your Astro configuration (\`${settingKey}: false\`). This setting is either a default setting or was explicitly set in your configuration. Sentry won't override this setting. Without source maps, code snippets on the Sentry Issues page will remain minified. To show unminified code, enable source maps in \`${settingKey}\` (e.g. by setting them to \`hidden\`).`,
      );
    } else {
      logger.warn('Source map generation is disabled in your Astro configuration.');
    }
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    previousUserSourceMapSetting = 'enabled';
    updatedSourceMapSetting = viteSourceMap;

    debug &&
      logger.info(
        `We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
  } else if (outputSourceMapSettings.length > 0) {
    previousUserSourceMapSetting = outputSourceMapSettings.every(setting => setting === false) ? 'disabled' : 'enabled';
    updatedSourceMapSetting = undefined;

    debug &&
      logger.info(
        `We discovered \`sourcemap\` in the output options of \`vite.build\`, which overrides \`${settingKey}\`. Sentry will keep this source map setting.`,
      );
  } else {
    previousUserSourceMapSetting = 'unset';
    updatedSourceMapSetting = undefined;

    const sourcemaps = sentryOptions?.sourcemaps;
    const { injectDebugIds, upload, legacyDisable } = resolveSourceMapsFeatures(sourcemaps);

    // Astro fixes the setting of the client build before the bundler plugin can turn source maps on.
    // TODO(v12): Remove the `disable-upload` case along with `sourcemaps.disable`.
    if (
      (upload && hasSourceMapUploadCredentials(sentryOptions)) ||
      legacyDisable === 'disable-upload' ||
      (sourcemaps?.delete === false && injectDebugIds)
    ) {
      updatedSourceMapSetting = 'hidden';

      debug &&
        logger.info(
          sourcemaps?.delete === false
            ? `Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps stay in the build output.`
            : `Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps will be deleted after they were uploaded to Sentry.`,
        );
    }
  }

  return { previousUserSourceMapSetting, updatedSourceMapSetting };
}

/**
 * Whether the user set `build.sourcemap` for the given Vite environment.
 * Astro copies the top-level setting into the `client` environment, so
 * the bundler plugin also passes that name when the user set nothing there.
 */
export function hasEnvironmentSourceMapSetting(astroConfig: AstroConfig, environment: string | undefined): boolean {
  if (environment === undefined) {
    return false;
  }
  // Astro 4 types `vite` with Vite 5, which has no environments.
  const vite = astroConfig.vite as
    | { environments?: Record<string, { build?: { sourcemap?: unknown } } | undefined> }
    | undefined;
  return vite?.environments?.[environment]?.build?.sourcemap !== undefined;
}

type OutputOptions = { sourcemap?: unknown };
type BundlerOptions = { output?: OutputOptions | OutputOptions[] };

/**
 * The `sourcemap` settings of the bundler outputs, which override
 * `vite.build.sourcemap`. Vite 8 reads both options.
 */
function getOutputSourceMapSettings(
  build: { rollupOptions?: BundlerOptions; rolldownOptions?: BundlerOptions } | undefined,
): unknown[] {
  return [build?.rolldownOptions?.output ?? [], build?.rollupOptions?.output ?? []]
    .flat()
    .map(output => output.sourcemap)
    .filter(setting => setting !== undefined);
}
