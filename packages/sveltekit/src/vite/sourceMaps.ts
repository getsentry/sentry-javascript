import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore -sorcery has no types :(
// eslint-disable-next-line import/default
import * as sorcery from 'sorcery';
import type { Plugin } from 'vite';

const DEFAULT_PLUGIN_OPTIONS: SentryVitePluginOptions = {
  // TODO: Read these values from the node adapter somehow as the out dir can be changed in the adapter options
  include: ['build/server', 'build/client'],
};

// sorcery has no types, so these are some basic type definitions:
type Chain = {
  write(): Promise<void>;
  apply(): Promise<void>;
};
type Sorcery = {
  load(filepath: string): Promise<Chain>;
};

type SentryVitePluginOptionsOptionalInclude = Omit<SentryVitePluginOptions, 'include'> & {
  include?: SentryVitePluginOptions['include'];
};

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
export function makeCustomSentryVitePlugin(options?: SentryVitePluginOptionsOptionalInclude): Plugin {
  const mergedOptions = {
    ...DEFAULT_PLUGIN_OPTIONS,
    ...options,
  };
  const sentryPlugin: Plugin = sentryVitePlugin(mergedOptions);

  const { debug } = mergedOptions;
  const { buildStart, resolveId, transform, renderChunk } = sentryPlugin;

  let upload = true;

  const customPlugin: Plugin = {
    name: 'sentry-vite-plugin-custom',
    apply: 'build', // only apply this plugin at build time
    enforce: 'post',

    // These hooks are copied from the original Sentry Vite plugin.
    // They're mostly responsible for options parsing and release injection.
    buildStart,
    resolveId,
    renderChunk,
    transform,

    // Modify the config to generate source maps
    config: config => {
      // eslint-disable-next-line no-console
      debug && console.log('[Source Maps Plugin] Enabeling source map generation');
      return {
        ...config,
        build: {
          ...config.build,
          sourcemap: true,
        },
      };
    },

    configResolved: config => {
      // The SvelteKit plugins trigger additional builds within the main (SSR) build.
      // We just need a mechanism to upload source maps only once.
      // `config.build.ssr` is `true` for that first build and `false` in the other ones.
      // Hence we can use it as a switch to upload source maps only once in main build.
      if (!config.build.ssr) {
        upload = false;
      }
    },

    // We need to start uploading source maps later than in the original plugin
    // because SvelteKit is still doing some stuff at closeBundle.
    closeBundle: () => {
      if (!upload) {
        return;
      }

      // TODO: Read the out dir from the node adapter somehow as it can be changed in the adapter options
      const outDir = path.resolve(process.cwd(), 'build');

      const jsFiles = getFiles(outDir).filter(file => file.endsWith('.js'));

      // eslint-disable-next-line no-console
      debug && console.log('[Source Maps Plugin] Flattening source maps');

      jsFiles.forEach(async file => {
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
      });

      // @ts-ignore - this hook exists on the plugin!
      sentryPlugin.writeBundle();
    },
  };

  return customPlugin;
}

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const files: string[] = dirents.map(dirent => {
    const resFileOrDir = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(resFileOrDir) : resFileOrDir;
  });

  return Array.prototype.concat(...files);
}
