import * as fs from 'fs';
import * as path from 'path';

/**
 * Supported @sveltejs/adapters-[adapter] SvelteKit adapters
 */
export type SupportedSvelteKitAdapters = 'node' | 'auto' | 'vercel' | 'other';

type PackageJson = {
  dependencies?: Record<string, Record<string, string>>;
  devDependencies?: Record<string, Record<string, string>>;
} & Record<string, unknown>;

/**
 * Tries to detect the used adapter for SvelteKit by looking at the dependencies.
 * returns the name of the adapter or 'other' if no supported adapter was found.
 */
export async function detectAdapter(): Promise<SupportedSvelteKitAdapters> {
  const pkgJson = await loadPackageJson();

  const allDependencies = [...Object.keys(pkgJson.dependencies || {}), ...Object.keys(pkgJson.devDependencies || {})];

  if (allDependencies.find(dep => dep === '@sveltejs/adapter-vercel')) {
    return 'vercel';
  }
  if (allDependencies.find(dep => dep === '@sveltejs/adapter-node')) {
    return 'node';
  }
  if (allDependencies.find(dep => dep === '@sveltejs/adapter-auto')) {
    return 'auto';
  }

  return 'other';
}

/**
 * Imports the pacakge.json file and returns the parsed JSON object.
 */
async function loadPackageJson(): Promise<PackageJson> {
  const pkgFile = path.join(process.cwd(), 'package.json');

  try {
    if (!fs.existsSync(pkgFile)) {
      throw `${pkgFile} does not exist}`;
    }

    const pkgJsonContent = (await fs.promises.readFile(pkgFile, 'utf-8')).toString();

    return JSON.parse(pkgJsonContent);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[Sentry SvelteKit Plugin] Couldn't load package.json:");
    // eslint-disable-next-line no-console
    console.log(e);

    return {};
  }
}
