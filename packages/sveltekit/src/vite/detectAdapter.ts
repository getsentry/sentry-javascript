import * as fs from 'fs';
import * as path from 'path';
import type { Package } from '@sentry/types';

/**
 * Supported @sveltejs/adapters-[adapter] SvelteKit adapters
 */
export type SupportedSvelteKitAdapters = 'node' | 'auto' | 'vercel' | 'other';

/**
 * Tries to detect the used adapter for SvelteKit by looking at the dependencies.
 * returns the name of the adapter or 'other' if no supported adapter was found.
 */
export async function detectAdapter(debug?: boolean): Promise<SupportedSvelteKitAdapters> {
  const pkgJson = await loadPackageJson();

  const allDependencies = pkgJson ? { ...pkgJson.dependencies, ...pkgJson.devDependencies } : {};

  let adapter: SupportedSvelteKitAdapters = 'other';
  if (allDependencies['@sveltejs/adapter-vercel']) {
    adapter = 'vercel';
  } else if (allDependencies['@sveltejs/adapter-node']) {
    adapter = 'node';
  } else if (allDependencies['@sveltejs/adapter-auto']) {
    adapter = 'auto';
  }

  if (debug) {
    if (adapter === 'other') {
      // eslint-disable-next-line no-console
      console.warn(
        "[Sentry SvelteKit Plugin] Couldn't detect SvelteKit adapter. Please set the 'adapter' option manually.",
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[Sentry SvelteKit Plugin] Detected SvelteKit ${adapter} adapter`);
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
