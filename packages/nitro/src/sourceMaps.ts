import type { InternalOptions as BundlerPluginOptions } from '@sentry/bundler-plugins/core';
import { createSentryBuildPluginManager } from '@sentry/bundler-plugins/core';
import { resolveSourceMapsFeatures, warnOnConflictingSourceMapOptions } from '@sentry/core';
import type { Nitro, NitroConfig } from 'nitro/types';
import type { SentryNitroOptions } from './config';

/**
 * Registers a `compiled` hook to upload source maps after the build completes.
 */
export function setupSourceMaps(nitro: Nitro, options?: SentryNitroOptions, sentryEnabledSourcemaps?: boolean): void {
  // The plugin manager does not get `sourcemaps.delete`.
  warnOnConflictingSourceMapOptions(options?.sourcemaps);

  // The `compiled` hook fires on EVERY rebuild during `nitro dev` watch mode.
  // nitro.options.dev is reliably set by the time module setup runs.
  if (shouldSkipBuildHook(nitro, options)) {
    return;
  }

  nitro.hooks.hook('compiled', async (_nitro: Nitro) => {
    await handleSourceMapUpload(_nitro, options, sentryEnabledSourcemaps);
  });
}

/**
 * Determines if the build hook, which creates the release and uploads source maps, should be skipped.
 */
function shouldSkipBuildHook(nitro: Nitro, options?: SentryNitroOptions): boolean {
  return !!(
    nitro.options.dev ||
    nitro.options.preset === 'nitro-prerender' ||
    // TODO(v12): Run the hook with `sourcemaps.disable: true` too, like with the options that replace it.
    resolveSourceMapsFeatures(options?.sourcemaps).legacyDisable === true
  );
}

/**
 * With `sourcemap: false` or `'inline'`, the build has no `.map` files to upload or delete.
 */
function hasSourceMapFiles(nitro: Nitro): boolean {
  return nitro.options.sourcemap !== false && (nitro.options.sourcemap as unknown) !== 'inline';
}

/**
 * Handles the actual source map upload after the build completes.
 */
async function handleSourceMapUpload(
  nitro: Nitro,
  options?: SentryNitroOptions,
  sentryEnabledSourcemaps?: boolean,
): Promise<void> {
  const outputDir = nitro.options.output.serverDir;
  const pluginOptions = getPluginOptions(options, sentryEnabledSourcemaps, outputDir);

  const sentryBuildPluginManager = createSentryBuildPluginManager(pluginOptions, {
    buildTool: 'nitro',
    loggerPrefix: '[@sentry/nitro]',
  });

  await sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal();
  await sentryBuildPluginManager.createRelease();

  if (!hasSourceMapFiles(nitro)) {
    return;
  }

  await sentryBuildPluginManager.injectDebugIds([outputDir]);

  const { upload } = resolveSourceMapsFeatures(options?.sourcemaps);

  if (upload) {
    await sentryBuildPluginManager.uploadSourcemaps([outputDir], {
      // We don't prepare the artifacts because we injected debug IDs manually before
      prepareArtifacts: false,
    });
  }

  // Without an upload the user uploads the source maps by hand, so they stay unless `sourcemaps.delete` is `true`.
  if (upload || options?.sourcemaps?.delete === true) {
    await sentryBuildPluginManager.deleteArtifacts();
  }
}

/**
 * Normalizes the beginning of a path from e.g. ../../../ to ./
 */
function normalizePath(path: string): string {
  return path.replace(/^(\.\.\/)+/, './');
}

/**
 * Removes a trailing slash from a path so glob patterns can be appended cleanly.
 */
function removeTrailingSlash(path: string): string {
  return path.replace(/\/$/, '');
}

/**
 * Builds the plugin options for `createSentryBuildPluginManager` from the Sentry Nitro options.
 *
 * Only exported for testing purposes.
 */
// oxlint-disable-next-line complexity
export function getPluginOptions(
  options?: SentryNitroOptions,
  sentryEnabledSourcemaps?: boolean,
  outputDir?: string,
): BundlerPluginOptions {
  const deleteOption = options?.sourcemaps?.delete;
  // oxlint-disable-next-line typescript/no-deprecated
  const userFilesToDelete = options?.sourcemaps?.filesToDeleteAfterUpload;
  // `sourcemaps.delete` replaces the rule that only the source maps Sentry enabled are deleted.
  const defaultFilesToDelete =
    (deleteOption ?? sentryEnabledSourcemaps) && outputDir ? [`${removeTrailingSlash(outputDir)}/**/*.map`] : undefined;
  // The user's files replace the default. With `sourcemaps.delete: true` both apply.
  const filesToDeleteAfterUpload =
    deleteOption === true && defaultFilesToDelete
      ? [...defaultFilesToDelete, ...[userFilesToDelete ?? []].flat()]
      : (userFilesToDelete ?? defaultFilesToDelete);

  if (options?.debug && defaultFilesToDelete && userFilesToDelete === undefined) {
    // eslint-disable-next-line no-console
    console.log(
      `[@sentry/nitro] Deleting the generated source maps after the upload: ${defaultFilesToDelete.join(', ')}`,
    );
  }

  return {
    org: options?.org ?? process.env.SENTRY_ORG,
    project: options?.project ?? process.env.SENTRY_PROJECT,
    authToken: options?.authToken ?? process.env.SENTRY_AUTH_TOKEN,
    url: options?.sentryUrl ?? process.env.SENTRY_URL,
    headers: options?.headers,
    telemetry: options?.telemetry ?? true,
    debug: options?.debug ?? false,
    silent: options?.silent ?? false,
    errorHandler: options?.errorHandler,
    sourcemaps: {
      // oxlint-disable-next-line typescript/no-deprecated
      disable: options?.sourcemaps?.disable,
      upload: options?.sourcemaps?.upload,
      injectDebugIds: options?.sourcemaps?.injectDebugIds,
      assets: options?.sourcemaps?.assets,
      ignore: options?.sourcemaps?.ignore,
      sdkFilesToDeleteAfterUpload: filesToDeleteAfterUpload,
      rewriteSources: options?.sourcemaps?.rewriteSources ?? ((source: string) => normalizePath(source)),
    },
    release: options?.release,
    bundleSizeOptimizations: options?.bundleSizeOptimizations,
    _metaOptions: {
      telemetry: {
        metaFramework: 'nitro',
      },
    },
  };
}

/*  Source map configuration rules:
    1. User explicitly disabled source maps (sourcemap: false)
      - Keep their setting, emit a warning that errors won't be unminified in Sentry
      - We will not upload anything
    2. User enabled source map generation (true)
      - Keep their setting (don't modify besides uploading)
    3. User did not set source maps (undefined)
      - We enable source maps when Sentry uploads them, or when `sourcemaps.delete: false` keeps them for a manual
        upload. Otherwise we leave the setting unset
      - Delete the .map files after the upload
*/
export function configureSourcemapSettings(
  config: NitroConfig,
  moduleOptions?: SentryNitroOptions,
): { sentryEnabledSourcemaps: boolean } {
  const { injectDebugIds, upload, legacyDisable } = resolveSourceMapsFeatures(moduleOptions?.sourcemaps);
  if (legacyDisable === true) {
    return { sentryEnabledSourcemaps: false };
  }

  // TODO(v12): Remove the `disable-upload` case along with `sourcemaps.disable`.
  const usesSourceMaps = upload || legacyDisable === 'disable-upload';
  // Without an upload, Sentry only turns source maps on when `sourcemaps.delete: false` keeps them.
  const sentryEnablesSourceMaps = usesSourceMaps || (moduleOptions?.sourcemaps?.delete === false && injectDebugIds);

  // Nitro types `sourcemap` as `boolean`, but it forwards the value to Vite which also accepts `'hidden'` and `'inline'`.
  const userSourcemap = (config as { sourcemap?: boolean | 'hidden' | 'inline' }).sourcemap;

  if (userSourcemap === false) {
    usesSourceMaps &&
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nitro] You have explicitly disabled source maps (`sourcemap: false`). Sentry will not upload source maps, and errors will not be unminified. To let Sentry handle source maps, remove the `sourcemap` option from your Nitro config, or set `sourcemaps: { upload: false }` in your Sentry options to silence this warning.',
      );
    return { sentryEnabledSourcemaps: false };
  }

  if (userSourcemap === 'inline') {
    usesSourceMaps &&
      // eslint-disable-next-line no-console
      console.warn(
        '[@sentry/nitro] You have set `sourcemap: "inline"`. Inline source maps are embedded in the output bundle, so there are no `.map` files to upload. Sentry will not upload source maps. Set `sourcemap: "hidden"` (or leave it unset) to let Sentry upload source maps and un-minify errors.',
      );
    return { sentryEnabledSourcemaps: false };
  }

  let sentryEnabledSourcemaps = false;
  if (userSourcemap === true || userSourcemap === 'hidden') {
    if (moduleOptions?.debug) {
      // eslint-disable-next-line no-console
      console.log(
        `[@sentry/nitro] Source maps are already enabled (\`sourcemap: ${JSON.stringify(userSourcemap)}\`). Sentry will upload them for error unminification.`,
      );
    }
  } else if (sentryEnablesSourceMaps) {
    // User did not explicitly set sourcemap, enable hidden source maps for Sentry.
    // `'hidden'` emits .map files without adding a `//# sourceMappingURL=` comment to the output, avoiding public exposure.
    (config as { sourcemap?: unknown }).sourcemap = 'hidden';
    sentryEnabledSourcemaps = true;
    if (moduleOptions?.debug) {
      // eslint-disable-next-line no-console
      console.log(
        '[@sentry/nitro] Enabled hidden source map generation for Sentry. Source map files will be deleted after upload.',
      );
    }
  }

  // Nitro v3 has a `sourcemapMinify` plugin that destructively deletes `sourcesContent`,
  // `x_google_ignoreList`, and clears `mappings` for any chunk containing `node_modules`.
  // This makes sourcemaps unusable for Sentry.
  config.experimental = config.experimental || {};
  config.experimental.sourcemapMinify = false;

  return { sentryEnabledSourcemaps };
}
