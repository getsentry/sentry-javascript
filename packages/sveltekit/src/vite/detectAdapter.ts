import type { Package } from '@sentry/core';
import * as fs from 'fs';
import * as path from 'path';
import type { ResolvedKitConfig } from './kitConfig';

/**
 * Supported @sveltejs/adapters-[adapter] SvelteKit adapters
 */
export type SupportedSvelteKitAdapters = 'node' | 'auto' | 'vercel' | 'cloudflare' | 'other';

/** Maps adapter.name from svelte.config.js to our SupportedSvelteKitAdapters */
const ADAPTER_NAME_MAP: Record<string, SupportedSvelteKitAdapters> = {
  '@sveltejs/adapter-vercel': 'vercel',
  '@sveltejs/adapter-node': 'node',
  '@sveltejs/adapter-cloudflare': 'cloudflare',
  // adapter-auto is intentionally the last entry here because it's installed by default
  // many users don't remove it when installing a new adapter, so we need to make sure
  // it's detected last when doing the package.json based detection.
  '@sveltejs/adapter-auto': 'auto',
};

/**
 * Tries to detect the used adapter for SvelteKit.
 * 1. If kitConfig is provided and has adapter.name, uses that (source of truth from SvelteKit itself).
 * 2. Otherwise falls back to inferring from package.json dependencies.
 * Returns the name of the adapter or 'other' if no supported adapter was found.
 *
 * @param kitConfig - Resolved SvelteKit config (e.g. from the kit config resolver). Pass `undefined` to skip config-based detection.
 * @param debug - Whether to log detection result. Pass `undefined` for false.
 */
export async function detectAdapter(
  kitConfig: ResolvedKitConfig | undefined,
  debug: boolean | undefined,
): Promise<SupportedSvelteKitAdapters> {
  const adapterName = kitConfig?.adapter?.name;
  if (adapterName && typeof adapterName === 'string') {
    const mapped = ADAPTER_NAME_MAP[adapterName];
    if (mapped) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log(`[Sentry SvelteKit Plugin] Detected SvelteKit ${mapped} adapter from your SvelteKit config`);
      }
      return mapped;
    }
    // We found an adapter name but it's not in our supported list -> return 'other'
    // The SvelteKit config is the source of truth, so we don't need to fall back to package.json.
    if (debug) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry SvelteKit Plugin] Detected unsupported adapter name ${adapterName} in your SvelteKit config. Please set the 'adapter' option manually`,
      );
    }
    return 'other';
  }

  const pkgJson = await loadPackageJson();
  const allDependencies = pkgJson ? { ...pkgJson.dependencies, ...pkgJson.devDependencies } : {};

  const adapterPackage = Object.keys(ADAPTER_NAME_MAP).find(key => allDependencies[key]);
  const adapter = (adapterPackage && ADAPTER_NAME_MAP[adapterPackage]) || 'other';

  if (debug) {
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
