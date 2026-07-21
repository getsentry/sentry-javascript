import * as fs from 'node:fs';
import * as path from 'node:path';

// Dependencies that signal a Cloudflare Workers build. There is no long-running Node server entry to wrap and
// `Sentry.init` must run inside the worker, so build-time injection must be skipped entirely for these apps.
const CLOUDFLARE_DEPENDENCIES = ['@cloudflare/vite-plugin', 'wrangler', '@react-router/cloudflare'];

/**
 * Whether the given set of (dev)dependencies indicates a Cloudflare Workers target. Pure and therefore
 * unit-testable without touching the filesystem.
 */
export function isCloudflareTarget(dependencies: Record<string, string | undefined>): boolean {
  return CLOUDFLARE_DEPENDENCIES.some(dep => dependencies[dep]);
}

/**
 * Detects whether a React Router app targets Cloudflare Workers by reading its `package.json` dependencies.
 * On any read/parse error we assume it does not (auto-injection then proceeds and falls back to its own guards).
 *
 * @param root - The (absolute) project root directory, e.g. Vite's `config.root`.
 */
export function detectCloudflareTarget(root: string): boolean {
  try {
    const packageJsonPath = path.resolve(root, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return isCloudflareTarget({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });
  } catch {
    return false;
  }
}
