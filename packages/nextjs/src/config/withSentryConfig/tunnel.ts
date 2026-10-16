import type { ManagedTunnelOptions } from '../../common/managedTunnelRoute';
import { MANAGED_TUNNEL_PATH_PARAM, MANAGED_TUNNEL_ROUTE } from '../../common/managedTunnelRoute';
import * as fs from 'fs';
import * as path from 'path';
import type { NextConfigObject } from '../types';

/**
 * The managed tunnel options for `tunnelRoute`, or `undefined` when the tunnel is off.
 *
 * `true` derives the path from the DSN at runtime. A string keeps that fixed path.
 */
export function getManagedTunnelOptions(
  userNextConfig: NextConfigObject,
  tunnelRoute: string | boolean | undefined,
): ManagedTunnelOptions | undefined {
  if (!tunnelRoute || userNextConfig.output === 'export') {
    return undefined;
  }

  return {
    basePath: userNextConfig.basePath ?? '',
    ...(typeof tunnelRoute === 'string' && { path: tunnelRoute }),
  };
}

/**
 * Rewrites tunnel requests to the app's own tunnel route, in the same process.
 *
 * With a DSN-derived path the config doesn't know the path, since it doesn't know the DSN. The rewrite matches any
 * single-segment envelope POST instead, and the route handler checks the path against the DSN.
 */
export function setUpTunnelRewriteRules(userNextConfig: NextConfigObject, tunnelOptions: ManagedTunnelOptions): void {
  const originalRewrites = userNextConfig.rewrites;

  const tunnelRewrite = tunnelOptions.path
    ? {
        source: `${tunnelOptions.path}(/?)`,
        destination: `${MANAGED_TUNNEL_ROUTE}?${MANAGED_TUNNEL_PATH_PARAM}=${encodeURIComponent(tunnelOptions.path.replace(/^\//, ''))}`,
      }
    : {
        source: '/:sentryTunnelPath',
        has: [{ type: 'header', key: 'content-type', value: 'application/x-sentry-envelope' }],
        destination: `${MANAGED_TUNNEL_ROUTE}?${MANAGED_TUNNEL_PATH_PARAM}=:sentryTunnelPath`,
      };

  // This function doesn't take any arguments at the time of writing but we future-proof
  // here in case Next.js ever decides to pass some
  userNextConfig.rewrites = async (...args: unknown[]) => {
    if (typeof originalRewrites !== 'function') {
      return { beforeFiles: [tunnelRewrite], afterFiles: [], fallback: [] };
    }

    // @ts-expect-error Expected 0 arguments but got 1 - this is from the future-proofing mentioned above, so we don't care about it
    const originalRewritesResult = await originalRewrites(...args);

    if (Array.isArray(originalRewritesResult)) {
      return { beforeFiles: [tunnelRewrite], afterFiles: originalRewritesResult, fallback: [] };
    }

    return {
      ...originalRewritesResult,
      beforeFiles: [tunnelRewrite, ...(originalRewritesResult.beforeFiles || [])],
    };
  };
}

const MANAGED_TUNNEL_ROUTE_FILE_CONTENTS = `// Answers Sentry's tunnel (\`tunnelRoute\`). Created by \`withSentryConfig\`, commit it with your app.
export { POST } from '@sentry/nextjs/tunnel';
`;

/**
 * Creates the route the tunnel rewrite points at, unless the app already has it.
 *
 * Next.js only routes files it finds in the app directory, and a route created after it scanned them is missed,
 * so the file is written before the build or dev server starts and kept in place.
 *
 * @returns The path of the file it created, if any.
 */
export function ensureTunnelRouteFile(projectDir: string = process.cwd()): string | undefined {
  const appDir = resolveAppDir(projectDir);
  const routeDir = path.join(appDir, MANAGED_TUNNEL_ROUTE);
  const hasRouteFile = ['ts', 'tsx', 'js', 'jsx', 'mjs'].some(extension =>
    fs.existsSync(path.join(routeDir, `route.${extension}`)),
  );
  if (hasRouteFile) {
    return undefined;
  }

  const extension = fs.existsSync(path.join(projectDir, 'tsconfig.json')) ? 'ts' : 'js';
  const routeFile = path.join(routeDir, `route.${extension}`);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(routeFile, MANAGED_TUNNEL_ROUTE_FILE_CONTENTS);

  return routeFile;
}

/**
 * Next.js only reads `src/app` and `src/pages` when neither `app` nor `pages` exists in the project root.
 */
function resolveAppDir(projectDir: string): string {
  const appDir = path.join(projectDir, 'app');
  if (isDirectory(appDir) || isDirectory(path.join(projectDir, 'pages'))) {
    return appDir;
  }

  return isDirectory(path.join(projectDir, 'src')) ? path.join(projectDir, 'src', 'app') : appDir;
}

function isDirectory(dir: string): boolean {
  return fs.existsSync(dir) && fs.lstatSync(dir).isDirectory();
}
