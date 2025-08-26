import { escapeStringForRegex, uuid4 } from '@sentry/core';
import { getSentryRelease } from '@sentry/node';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, UserConfig } from 'vite';
import { WRAPPED_MODULE_SUFFIX } from '../common/utils';
import type { BackwardsForwardsCompatibleSvelteConfig } from './svelteConfig';
import { getAdapterOutputDir } from './svelteConfig';
import type { CustomSentryVitePluginOptions } from './types';

// sorcery has no types, so these are some basic type definitions:
type Chain = {
  write(): Promise<void>;
  apply(): Promise<void>;
};
type Sorcery = {
  load(filepath: string): Promise<Chain>;
};

// storing this in the module scope because `makeCustomSentryVitePlugin` is called multiple times
// and we only want to generate a uuid once in case we have to fall back to it.
const releaseName = detectSentryRelease();

type FilesToDeleteAfterUpload = string | string[] | undefined;

/**
 * Creates a new Vite plugin that uses the unplugin-based Sentry Vite plugin to create
 * releases and upload source maps to Sentry.
 *
 * Because the unplugin-based Sentry Vite plugin doesn't work ootb with SvelteKit,
 * we need to add some additional stuff to make source maps work:
 *
 * - the `config` hook needs to be added to generate source maps
 * - the `configResolved` hook tells us when to upload source maps.
 *   We only want to upload once at the end, given that SvelteKit makes multiple builds
 * - the `closeBundle` hook is used to flatten server source maps, which at the moment is necessary for SvelteKit.
 *   After the maps are flattened, they're uploaded to Sentry as in the original plugin.
 *   see: https://github.com/sveltejs/kit/discussions/9608
 *
 * @returns the custom Sentry Vite plugin
 */
export async function makeCustomSentryVitePlugins(
  options: CustomSentryVitePluginOptions,
  svelteConfig: BackwardsForwardsCompatibleSvelteConfig,
): Promise<Plugin[]> {
  const usedAdapter = options?.adapter || 'other';
  const adapterOutputDir = await getAdapterOutputDir(svelteConfig, usedAdapter);

  const defaultPluginOptions: SentryVitePluginOptions = {
    release: {
      name: releaseName,
    },
    _metaOptions: {
      telemetry: {
        metaFramework: 'sveltekit',
      },
    },
  };

  let _resolveFilesToDeleteAfterUpload:
    | undefined
    | ((value: FilesToDeleteAfterUpload | Promise<FilesToDeleteAfterUpload>) => void);
  const filesToDeleteAfterUploadPromise = new Promise<FilesToDeleteAfterUpload>(resolve => {
    _resolveFilesToDeleteAfterUpload = resolve;
  });

  const mergedOptions = {
    ...defaultPluginOptions,
    ...options,
    release: {
      ...defaultPluginOptions.release,
      ...options?.release,
    },
    sourcemaps: {
      ...options?.sourcemaps,
      filesToDeleteAfterUpload: filesToDeleteAfterUploadPromise,
    },
  };

  const { debug } = mergedOptions;

  const sentryPlugins: Plugin[] = await sentryVitePlugin(mergedOptions);

  const sentryViteDebugIdUploadPlugin = sentryPlugins.find(
    plugin => plugin.name === 'sentry-vite-debug-id-upload-plugin',
  );

  const sentryViteFileDeletionPlugin = sentryPlugins.find(plugin => plugin.name === 'sentry-file-deletion-plugin');

  const sentryViteReleaseManagementPlugin = sentryPlugins.find(
    // sentry-debug-id-upload-plugin was the old (misleading) name of the plugin
    // sentry-release-management-plugin is the new name
    plugin => plugin.name === 'sentry-debug-id-upload-plugin' || plugin.name === 'sentry-release-management-plugin',
  );

  if (!sentryViteDebugIdUploadPlugin) {
    debug &&
      // eslint-disable-next-line no-console
      console.warn(
        'sentry-vite-debug-id-upload-plugin not found in sentryPlugins! Cannot modify plugin - returning default Sentry Vite plugins',
      );

    // resolving filesToDeleteAfterUpload here, because we return the original deletion plugin which awaits the promise
    _resolveFilesToDeleteAfterUpload?.(undefined);

    return sentryPlugins;
  }

  if (!sentryViteFileDeletionPlugin) {
    debug &&
      // eslint-disable-next-line no-console
      console.warn(
        'sentry-file-deletion-plugin not found in sentryPlugins! Cannot modify plugin - returning default Sentry Vite plugins',
      );

    // resolving filesToDeleteAfterUpload here, because we return the original deletion plugin which awaits the promise
    _resolveFilesToDeleteAfterUpload?.(undefined);

    return sentryPlugins;
  }

  if (!sentryViteReleaseManagementPlugin) {
    debug &&
      // eslint-disable-next-line no-console
      console.warn(
        'sentry-release-management-plugin not found in sentryPlugins! Cannot modify plugin - returning default Sentry Vite plugins',
      );

    // resolving filesToDeleteAfterUpload here, because we return the original deletion plugin which awaits the promise
    _resolveFilesToDeleteAfterUpload?.(undefined);

    return sentryPlugins;
  }

  const unchangedSentryVitePlugins = sentryPlugins.filter(
    plugin =>
      ![
        'sentry-vite-debug-id-upload-plugin',
        'sentry-file-deletion-plugin',
        'sentry-release-management-plugin', // new name of release management plugin
        'sentry-debug-id-upload-plugin', // old name of release management plugin
      ].includes(plugin.name),
  );

  let isSSRBuild = true;

  const sourceMapSettingsPlugin: Plugin = {
    name: 'sentry-sveltekit-update-source-map-setting-plugin',
    apply: 'build', // only apply this plugin at build time
    config: async (config: UserConfig) => {
      return {
        ...config,
        build: {
          ...config.build,
          sourcemap: _getUpdatedSourceMapSettings(config, options),
        },
      };
    },
  };

  const filesToDeleteAfterUploadConfigPlugin: Plugin = {
    name: 'sentry-sveltekit-files-to-delete-after-upload-setting-plugin',
    apply: 'build', // only apply this plugin at build time
    config: (config: UserConfig) => {
      const originalFilesToDeleteAfterUpload = options?.sourcemaps?.filesToDeleteAfterUpload;

      if (typeof originalFilesToDeleteAfterUpload === 'undefined' && typeof config.build?.sourcemap === 'undefined') {
        // Including all hidden (`.*`) directories by default so that folders like .vercel,
        // .netlify, etc are also cleaned up. Additionally, we include the adapter output
        // dir which could be a non-hidden directory, like `build` for the Node adapter.
        const defaultFileDeletionGlob = ['./.*/**/*.map', `./${adapterOutputDir}/**/*.map`];

        debug &&
          // eslint-disable-next-line no-console
          console.info(
            `[Sentry] Automatically setting \`sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload: [${defaultFileDeletionGlob
              .map(file => `"${file}"`)
              .join(', ')}]\` to delete generated source maps after they were uploaded to Sentry.`,
          );

        _resolveFilesToDeleteAfterUpload?.(defaultFileDeletionGlob);
      } else {
        _resolveFilesToDeleteAfterUpload?.(originalFilesToDeleteAfterUpload);
      }

      return config;
    },
  };

  const customDebugIdUploadPlugin: Plugin = {
    name: 'sentry-sveltekit-debug-id-upload-plugin',
    apply: 'build', // only apply this plugin at build time
    enforce: 'post', // this needs to be set to post, otherwise we don't pick up the output from the SvelteKit adapter
    configResolved: config => {
      // The SvelteKit plugins trigger additional builds within the main (SSR) build.
      // We just need a mechanism to upload source maps only once.
      // `config.build.ssr` is `true` for that first build and `false` in the other ones.
      // Hence we can use it as a switch to upload source maps only once in main build.
      if (!config.build.ssr) {
        isSSRBuild = false;
      }
    },

    // We need to start uploading source maps later than in the original plugin
    // because SvelteKit is invoking the adapter at closeBundle.
    // This means that we need to wait until the adapter is done before we start uploading.
    closeBundle: async () => {
      if (!isSSRBuild) {
        return;
      }

      const outDir = path.resolve(process.cwd(), adapterOutputDir);
      // eslint-disable-next-line no-console
      debug && console.log('[Source Maps Plugin] Looking up source maps in', outDir);

      const jsFiles = getFiles(outDir).filter(file => file.endsWith('.js'));
      // eslint-disable-next-line no-console
      debug && console.log('[Source Maps Plugin] Flattening source maps');

      // @ts-expect-error - we're using dynamic import here and TS complains about that. It works though.
      const sorcery = await import('sorcery');

      for (const file of jsFiles) {
        try {
          await (sorcery as Sorcery).load(file).then(async chain => {
            if (!chain) {
              // We end up here, if we don't have a source map for the file.
              // This is fine, as we're not interested in files w/o source maps.
              return;
            }
            // This flattens the source map
            await chain.apply();
            // Write it back to the original file
            await chain.write();
          });
        } catch (e) {
          // Sometimes sorcery fails to flatten the source map. While this isn't ideal, it seems to be mostly
          // happening in Kit-internal files which is fine as they're not in-app.
          // This mostly happens when sorcery tries to resolve a source map while flattening that doesn't exist.
          const isKnownError = e instanceof Error && e.message.includes('ENOENT: no such file or directory, open');
          if (debug && !isKnownError) {
            // eslint-disable-next-line no-console
            console.error('[Source Maps Plugin] error while flattening', file, e);
          }
        }

        // We need to remove the query string from the source map files that our auto-instrument plugin added
        // to proxy the load functions during building.
        const mapFile = `${file}.map`;
        if (fs.existsSync(mapFile)) {
          const mapContent = (await fs.promises.readFile(mapFile, 'utf-8')).toString();
          const cleanedMapContent = mapContent.replace(
            // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- no user input + escaped anyway
            new RegExp(escapeStringForRegex(WRAPPED_MODULE_SUFFIX), 'gm'),
            '',
          );
          await fs.promises.writeFile(mapFile, cleanedMapContent);
        }
      }

      try {
        // So here, we're just calling the original plugin's `writeBundle` method to upload the source maps.
        // Our plugin hook expects output options to glob for source maps. We don't have this option in `closeBundle`.
        // So we just pass in the `outDir` we determined earlier.
        // Not pretty but my testing shows that it works.
        // @ts-expect-error - this hook exists on the plugin!
        await sentryViteDebugIdUploadPlugin.writeBundle({ dir: outDir });
      } catch {
        // eslint-disable-next-line no-console
        console.warn('[Source Maps Plugin] Failed to upload source maps!');
        // eslint-disable-next-line no-console
        console.log(
          '[Source Maps Plugin] Please make sure you specified a valid Sentry auth token, as well as your org and project slugs.',
        );
        // eslint-disable-next-line no-console
        console.log(
          '[Source Maps Plugin] Further information: https://github.com/getsentry/sentry-javascript/blob/develop/packages/sveltekit/README.md#uploading-source-maps',
        );
      }
    },
  };

  // The file deletion plugin is originally called in `writeBundle`.
  // We need to call it in `closeBundle` though, because we also postpone
  // the upload step to `closeBundle`
  const customFileDeletionPlugin: Plugin = {
    name: 'sentry-sveltekit-file-deletion-plugin',
    apply: 'build', // only apply this plugin at build time
    enforce: 'post',
    closeBundle: async () => {
      if (!isSSRBuild) {
        return;
      }

      const writeBundleFn = sentryViteFileDeletionPlugin?.writeBundle;
      if (typeof writeBundleFn === 'function') {
        // This is fine though, because the original method doesn't consume any arguments in its `writeBundle` callback.
        const outDir = path.resolve(process.cwd(), adapterOutputDir);
        try {
          // @ts-expect-error - the writeBundle hook expects two args we can't pass in here (they're only available in `writeBundle`)
          await writeBundleFn({ dir: outDir });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('Failed to delete source maps:', e);
        }
      }
    },
  };

  const customReleaseManagementPlugin: Plugin = {
    name: 'sentry-sveltekit-release-management-plugin',
    apply: 'build', // only apply this plugin at build time
    enforce: 'post',
    closeBundle: async () => {
      try {
        // @ts-expect-error - this hook exists on the plugin!
        await sentryViteReleaseManagementPlugin.writeBundle();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Source Maps Plugin] Failed to upload release data:', e);
      }
    },
  };

  return [
    ...unchangedSentryVitePlugins,
    sourceMapSettingsPlugin,
    filesToDeleteAfterUploadConfigPlugin,
    customReleaseManagementPlugin,
    customDebugIdUploadPlugin,
    customFileDeletionPlugin,
  ];
}

/** There are 3 ways to set up source map generation (https://github.com/getsentry/sentry-j avascript/issues/13993)
 *
 *     1. User explicitly disabled source maps
 *       - keep this setting (emit a warning that errors won't be unminified in Sentry)
 *       - We won't upload anything
 *
 *     2. Users enabled source map generation (true, 'hidden', 'inline').
 *       - keep this setting (don't do anything - like deletion - besides uploading)
 *
 *     3. Users didn't set source maps generation
 *       - we enable 'hidden' source maps generation
 *       - configure `filesToDeleteAfterUpload` to delete all .map files (we emit a log about this)
 *
 * --> only exported for testing
 */
export function _getUpdatedSourceMapSettings(
  viteConfig: UserConfig,
  sentryPluginOptions?: CustomSentryVitePluginOptions,
): boolean | 'inline' | 'hidden' {
  viteConfig.build = viteConfig.build || {};

  const viteSourceMap = viteConfig?.build?.sourcemap;
  let updatedSourceMapSetting = viteSourceMap;

  const settingKey = 'build.sourcemap';
  const debug = sentryPluginOptions?.debug;

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
  } else if (viteSourceMap && ['hidden', 'inline', true].includes(viteSourceMap)) {
    updatedSourceMapSetting = viteSourceMap;

    debug &&
      // eslint-disable-next-line no-console
      console.log(
        `[Sentry] We discovered \`${settingKey}\` is set to \`${viteSourceMap.toString()}\`. Sentry will keep this source map setting. This will un-minify the code snippet on the Sentry Issue page.`,
      );
  } else {
    updatedSourceMapSetting = 'hidden';

    debug &&
      //  eslint-disable-next-line no-console
      console.log(
        `[Sentry] Enabled source map generation in the build options with \`${settingKey}: 'hidden'\`. The source maps  will be deleted after they were uploaded to Sentry.`,
      );
  }

  return updatedSourceMapSetting;
}

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const files: string[] = dirents.map(dirent => {
    const resFileOrDir = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(resFileOrDir) : resFileOrDir;
  });

  return Array.prototype.concat(...files);
}

function detectSentryRelease(): string {
  let releaseFallback: string;
  try {
    releaseFallback = child_process
      .execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // the command can throw for various reasons. Most importantly:
    // - git is not installed
    // - there is no git repo or no commit yet
    // regardless of the case we just fall back to assigning a random uuid.
    releaseFallback = uuid4();
  }
  const release = getSentryRelease() || releaseFallback;

  return release;
}
