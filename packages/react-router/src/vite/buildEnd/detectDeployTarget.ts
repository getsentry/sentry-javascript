import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The deployment target a React Router app is being built for. This determines whether (and how) Sentry can
 * automatically inject server-side instrumentation into the build output.
 *
 * - `node`: A long-running Node server started via `react-router-serve` (or a custom Node server). Sentry can
 *   fully auto-inject here (both `top-level-import` and `dynamic-import`).
 * - `vercel` / `netlify`: Serverless function targets. The `--import` Node flag and module register hooks are
 *   typically unavailable, so only `top-level-import` is viable and the build output layout differs from the
 *   default Node server build. Auto-injection is not yet implemented for these targets.
 * - `cloudflare`: Cloudflare Workers. There is no Node server entry to wrap and `Sentry.init` must run inside the
 *   worker, so build-time injection is skipped entirely.
 * - `unknown`: Could not determine the target. We optimistically treat this like `node`.
 */
export type DeployTarget = 'node' | 'vercel' | 'netlify' | 'cloudflare' | 'unknown';

// Dependencies that signal a given deploy target. Order matters: more specific (serverless/edge) targets are
// checked before the generic Node server, because a Vercel/Netlify/Cloudflare app may also depend on
// `@react-router/node`.
const DEPLOY_TARGET_DEPENDENCIES: Array<{ target: DeployTarget; deps: string[] }> = [
  { target: 'cloudflare', deps: ['@cloudflare/vite-plugin', 'wrangler', '@react-router/cloudflare'] },
  { target: 'vercel', deps: ['@vercel/react-router'] },
  { target: 'netlify', deps: ['@netlify/vite-plugin-react-router', '@netlify/react-router'] },
  { target: 'node', deps: ['@react-router/serve', '@react-router/node'] },
];

/**
 * Maps a set of (dev)dependencies to a {@link DeployTarget}. Pure and therefore unit-testable without touching the
 * filesystem.
 */
export function mapDependenciesToDeployTarget(dependencies: Record<string, string | undefined>): DeployTarget {
  for (const { target, deps } of DEPLOY_TARGET_DEPENDENCIES) {
    if (deps.some(dep => dependencies[dep])) {
      return target;
    }
  }

  return 'unknown';
}

/**
 * Detects the deploy target of a React Router app by reading its `package.json` dependencies.
 *
 * @param root - The (absolute) project root directory, e.g. Vite's `config.root`.
 */
export function detectDeployTarget(root: string): DeployTarget {
  try {
    const packageJsonPath = path.resolve(root, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return mapDependenciesToDeployTarget({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    });
  } catch {
    // If we cannot read or parse package.json we cannot make a decision - treat as unknown.
    return 'unknown';
  }
}
