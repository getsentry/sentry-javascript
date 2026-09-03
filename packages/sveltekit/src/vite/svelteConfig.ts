import type { Builder } from '@sveltejs/kit';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import type { SupportedSvelteKitAdapters } from './detectAdapter';
import type { ResolvedKitConfig } from './kitConfig';

/**
 * The contents of a `svelte.config.js` file. SvelteKit 3 removed this file; it only exists in
 * SvelteKit 1 and 2, where all SvelteKit options are nested under `kit`.
 */
export type SvelteConfigFileContents = {
  kit?: ResolvedKitConfig;
};

/**
 * Imports the svelte.config.js file and returns the config object.
 * The sveltekit plugins import the config in the same way.
 * See: https://github.com/sveltejs/kit/blob/master/packages/kit/src/core/config/index.js#L63
 *
 * Only a fallback now - the config is read from the SvelteKit Vite plugin instead, and SvelteKit 3
 * removed this file entirely (see `kitConfig.ts`).
 */
export async function loadSvelteConfig(): Promise<SvelteConfigFileContents> {
  // This can only be .js (see https://github.com/sveltejs/kit/pull/4031#issuecomment-1049475388)
  const SVELTE_CONFIG_FILE = 'svelte.config.js';

  const configFile = path.join(process.cwd(), SVELTE_CONFIG_FILE);

  try {
    if (!fs.existsSync(configFile)) {
      return {};
    }
    const svelteConfigModule = await import(`${url.pathToFileURL(configFile).href}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (svelteConfigModule?.default as SvelteConfigFileContents) || {};
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[Source Maps Plugin] Couldn't load svelte.config.js:");
    // eslint-disable-next-line no-console
    console.log(e);

    return {};
  }
}

/**
 * Reads a custom hooks directory from the SvelteKit config. In case no custom hooks
 * directory is specified, the default directory is returned.
 */
export function getHooksFileName(kitConfig: ResolvedKitConfig, hookType: 'client' | 'server'): string {
  return kitConfig.files?.hooks?.[hookType] || `src/hooks.${hookType}`;
}

/**
 * Attempts to read a custom output directory that can be specified in the options
 * of a SvelteKit adapter. If no custom output directory is specified, the default
 * directory is returned.
 */
export async function getAdapterOutputDir(
  kitConfig: ResolvedKitConfig,
  adapter: SupportedSvelteKitAdapters,
): Promise<string> {
  if (adapter === 'node') {
    return getNodeAdapterOutputDir(kitConfig);
  }
  if (adapter === 'cloudflare') {
    // Cloudflare outputs to outDir\cloudflare as the output dir
    return path.join(kitConfig.outDir || '.svelte-kit', 'cloudflare');
  }

  // Auto and Vercel adapters simply use config.kit.outDir
  // Let's also use this directory for the 'other' case
  return path.join(kitConfig.outDir || '.svelte-kit', 'output');
}

/**
 * To get the Node adapter output directory, we have to apply a hack and call the adapter's adapt method
 * with a custom adapter `Builder` that only calls the `writeClient` method.
 * This method is the first method that is called with the output directory.
 * Once we obtained the output directory, we throw an error to exit the adapter.
 *
 * see: https://github.com/sveltejs/kit/blob/master/packages/adapter-node/index.js#L17
 */
async function getNodeAdapterOutputDir(kitConfig: ResolvedKitConfig): Promise<string> {
  // 'build' is the default output dir for the node adapter
  let outputDir = 'build';

  if (!kitConfig.adapter) {
    return outputDir;
  }

  const nodeAdapter = kitConfig.adapter;

  const adapterBuilder: Builder = {
    writeClient(dest: string) {
      outputDir = dest.replace(/\/client.*/, '');
      throw new Error('We got what we came for, throwing to exit the adapter');
    },
    // @ts-expect-error - No need to implement the other methods
    log: {
      minor() {},
    },
    getBuildDirectory: () => '',
    rimraf: () => {},
    mkdirp: () => {},

    config: {
      kit: {
        // @ts-expect-error - the builder expects a validated config but for our purpose it's fine to just pass this partial config
        paths: {
          base: kitConfig.paths?.base || '',
        },
      },
    },
  };

  try {
    await nodeAdapter.adapt(adapterBuilder);
  } catch {
    // We expect the adapter to throw in writeClient!
  }

  return outputDir;
}
