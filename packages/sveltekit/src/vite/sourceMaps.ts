import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getSentryRelease } from '@sentry/node';
import { escapeStringForRegex, uuid4 } from '@sentry/utils';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';

import MagicString from 'magic-string';
import { WRAPPED_MODULE_SUFFIX } from './autoInstrument';
import type { GlobalSentryValues } from './injectGlobalValues';
import { VIRTUAL_GLOBAL_VALUES_FILE, getGlobalValueInjectionCode } from './injectGlobalValues';
import { getAdapterOutputDir, getHooksFileName, loadSvelteConfig } from './svelteConfig';
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
export async function makeCustomSentryVitePlugins(options?: CustomSentryVitePluginOptions): Promise<Plugin[]> {
  const svelteConfig = await loadSvelteConfig();

  const usedAdapter = options?.adapter || 'other';
  const outputDir = await getAdapterOutputDir(svelteConfig, usedAdapter);

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

  const mergedOptions = {
    ...defaultPluginOptions,
    ...options,
    release: {
      ...defaultPluginOptions.release,
      ...options?.release,
    },
  };
  const { debug } = mergedOptions;

  const sentryPlugins: Plugin[] = await sentryVitePlugin(mergedOptions);

  const sentryViteDebugIdUploadPlugin = sentryPlugins.find(
    plugin => plugin.name === 'sentry-vite-debug-id-upload-plugin',
  );

  if (!sentryViteDebugIdUploadPlugin) {
    debug &&
      // eslint-disable-next-line no-console
      console.warn(
        'sentry-vite-debug-id-upload-plugin not found in sentryPlugins! Cannot modify plugin - returning default Sentry Vite plugins',
      );
    return sentryPlugins;
  }

  const restOfSentryVitePlugins = sentryPlugins.filter(plugin => plugin.name !== 'sentry-vite-debug-id-upload-plugin');

  let isSSRBuild = true;

  const serverHooksFile = getHooksFileName(svelteConfig, 'server');

  const globalSentryValues: GlobalSentryValues = {
    __sentry_sveltekit_output_dir: outputDir,
  };

  const customPlugin: Plugin = {
    name: 'sentry-upload-sveltekit-source-maps',
    apply: 'build', // only apply this plugin at build time
    enforce: 'post', // this needs to be set to post, otherwise we don't pick up the output from the SvelteKit adapter

    // Modify the config to generate source maps
    config: config => {
      const sourceMapsPreviouslyNotEnabled = !config.build?.sourcemap;
      if (debug && sourceMapsPreviouslyNotEnabled) {
        // eslint-disable-next-line no-console
        console.log('[Source Maps Plugin] Enabling source map generation');
        if (!mergedOptions.sourcemaps?.filesToDeleteAfterUpload) {
          // eslint-disable-next-line no-console
          console.warn(
            `[Source Maps Plugin] We recommend setting the \`sourceMapsUploadOptions.sourcemaps.filesToDeleteAfterUpload\` option to clean up source maps after uploading.
[Source Maps Plugin] Otherwise, source maps might be deployed to production, depending on your configuration`,
          );
        }
      }
      return {
        ...config,
        build: {
          ...config.build,
          sourcemap: true,
        },
      };
    },

    resolveId: (id, _importer, _ref) => {
      if (id === VIRTUAL_GLOBAL_VALUES_FILE) {
        return {
          id: VIRTUAL_GLOBAL_VALUES_FILE,
          external: false,
          moduleSideEffects: true,
        };
      }
      return null;
    },

    load: id => {
      if (id === VIRTUAL_GLOBAL_VALUES_FILE) {
        return {
          code: getGlobalValueInjectionCode(globalSentryValues),
        };
      }
      return null;
    },

    configResolved: config => {
      // The SvelteKit plugins trigger additional builds within the main (SSR) build.
      // We just need a mechanism to upload source maps only once.
      // `config.build.ssr` is `true` for that first build and `false` in the other ones.
      // Hence we can use it as a switch to upload source maps only once in main build.
      if (!config.build.ssr) {
        isSSRBuild = false;
      }
    },

    transform: async (code, id) => {
      // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- not end user input + escaped anyway
      const isServerHooksFile = new RegExp(`/${escapeStringForRegex(serverHooksFile)}(.(js|ts|mjs|mts))?`).test(id);

      if (isServerHooksFile) {
        const ms = new MagicString(code);
        ms.append(`\n; import "${VIRTUAL_GLOBAL_VALUES_FILE}";\n`);
        return {
          code: ms.toString(),
          map: ms.generateMap({ hires: true }),
        };
      }

      return null;
    },

    // We need to start uploading source maps later than in the original plugin
    // because SvelteKit is invoking the adapter at closeBundle.
    // This means that we need to wait until the adapter is done before we start uploading.
    closeBundle: async () => {
      if (!isSSRBuild) {
        return;
      }

      const outDir = path.resolve(process.cwd(), outputDir);
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
      } catch (_) {
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

  return [...restOfSentryVitePlugins, customPlugin];
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
    releaseFallback = child_process.execSync('git rev-parse HEAD', { stdio: 'ignore' }).toString().trim();
  } catch (_) {
    // the command can throw for various reasons. Most importantly:
    // - git is not installed
    // - there is no git repo or no commit yet
    // regardless of the case we just fall back to assigning a random uuid.
    releaseFallback = uuid4();
  }
  const release = getSentryRelease() || releaseFallback;

  return release;
}
