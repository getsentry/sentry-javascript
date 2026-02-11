import type { Package } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Supported @sveltejs/adapters-[adapter] SvelteKit adapters
 */
export type SupportedSvelteKitAdapters = 'node' | 'auto' | 'vercel' | 'cloudflare' | 'other';

/**
 * Minimal svelte config shape needed for adapter detection.
 * SvelteKit's Adapter interface has a required `name` property (e.g. 'adapter-vercel').
 */
export type SvelteConfigForAdapterDetection = {
  kit?: { adapter?: { name?: string } };
};

/** Maps adapter.name from svelte.config.js to our SupportedSvelteKitAdapters */
const ADAPTER_NAME_MAP: Record<string, SupportedSvelteKitAdapters> = {
  '@sveltejs/adapter-vercel': 'vercel',
  '@sveltejs/adapter-node': 'node',
  '@sveltejs/adapter-cloudflare': 'cloudflare',
  '@sveltejs/adapter-auto': 'auto',
};

/**
 * Tries to detect the used adapter for SvelteKit.
 * 1. If svelteConfig is provided and has kit.adapter.name, uses that (source of truth from svelte.config.js).
 * 2. Otherwise falls back to inferring from package.json dependencies.
 * Returns the name of the adapter or 'other' if no supported adapter was found.
 *
 * @param svelteConfig - Loaded svelte config (e.g. from loadSvelteConfig()). Pass `undefined` to skip config-based detection.
 * @param debug - Whether to log detection result. Pass `undefined` for false.
 */
export async function detectAdapter(
  svelteConfig: SvelteConfigForAdapterDetection | undefined,
  debug: boolean | undefined,
): Promise<SupportedSvelteKitAdapters> {
  const isDebug = debug ?? false;

  const adapterName = svelteConfig?.kit?.adapter?.name;
  if (adapterName && typeof adapterName === 'string') {
    const mapped = ADAPTER_NAME_MAP[adapterName];
    if (mapped) {
      if (isDebug) {
        // eslint-disable-next-line no-console
        console.log(`[Sentry SvelteKit Plugin] Detected SvelteKit ${mapped} adapter from \`svelte.config.js\``);
      }
      return mapped;
    }
    // Known adapter name but not in our supported list -> still 'other'
  }

  const pkgJson = await loadPackageJson();
  const allDependencies = pkgJson ? { ...pkgJson.dependencies, ...pkgJson.devDependencies } : {};

  const adapter =
    (Object.keys(ADAPTER_NAME_MAP).find(key => allDependencies[key]) as SupportedSvelteKitAdapters) || 'other';

  if (isDebug) {
    if (adapter === 'other') {
      // eslint-disable-next-line no-console
      console.warn(
        "[Sentry SvelteKit Plugin] Couldn't detect SvelteKit adapter. Please set the 'adapter' option manually.",
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Sentry SvelteKit Plugin] Detected SvelteKit ${adapter} adapter from \`package.json\``);
    }
  }

  return adapter;
}

/**
 * Imports the package.json file and returns the parsed JSON object.
 */
async function loadPackageJson(): Promise<Package | undefined> {
  const pkgFile = path.join(process.cwd(), 'package.json');

  try {
    if (!fs.existsSync(pkgFile)) {
      throw new Error(`File ${pkgFile} doesn't exist}`);
    }

    const pkgJsonContent = (await fs.promises.readFile(pkgFile, 'utf-8')).toString();

    return JSON.parse(pkgJsonContent);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[Sentry SvelteKit Plugin] Couldn't load package.json:", e);
    return undefined;
  }
}
