import * as fs from 'fs';
import * as path from 'path';
import type { RouteInfo, RouteManifest } from './remixRouteManifest';

export type CreateRemixRouteManifestOptions = {
  /**
   * Path to the app directory (where routes folder is located)
   */
  appDirPath?: string;
  /**
   * The root directory of the project (defaults to process.cwd())
   */
  rootDir?: string;
};

let manifestCache: RouteManifest | null = null;
let lastAppDirPath: string | null = null;

/**
 * Check if a file is a route file
 */
function isRouteFile(filename: string): boolean {
  return filename.endsWith('.tsx') || filename.endsWith('.ts') || filename.endsWith('.jsx') || filename.endsWith('.js');
}

/**
 * Convert Remix route file paths to parameterized paths at build time.
 *
 * Examples:
 *   - index.tsx -> /
 *   - users.tsx -> /users
 *   - users.$id.tsx -> /users/:id
 *   - users.$id.posts.$postId.tsx -> /users/:id/posts/:postId
 *   - $.tsx -> /:*
 *   - docs.$.tsx -> /docs/:*
 *   - users/$id.tsx (nested folder) -> /users/:id
 *   - users/$id/posts.tsx (nested folder) -> /users/:id/posts
 *   - users/index.tsx (nested folder) -> /users
 *   - _layout.tsx -> null (pathless layout route, not URL-addressable)
 *   - _auth.tsx -> null (pathless layout route, not URL-addressable)
 *
 * @param filename - The route filename or path (can include directory separators for nested routes)
 * @returns Object containing the parameterized path and whether it's dynamic, or null for pathless layout routes
 * @internal Exported for testing purposes
 */
export function convertRemixRouteToPath(filename: string): { path: string; isDynamic: boolean } | null {
  // Remove file extension
  const basename = filename.replace(/\.(tsx?|jsx?)$/, '');

  // Handle root index route
  if (basename === 'index' || basename === '_index') {
    return { path: '/', isDynamic: false };
  }

  const normalizedBasename = basename.replace(/[/\\]/g, '.');
  const segments = normalizedBasename.split('.');
  const pathSegments: string[] = [];
  let isDynamic = false;
  let isIndexRoute = false;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (!segment) {
      continue;
    }

    if (segment.startsWith('_') && segment !== '_index') {
      continue;
    }

    // Handle '_index' segments at the end (always skip - indicates an index route)
    if (segment === '_index' && i === segments.length - 1) {
      isIndexRoute = true;
      continue;
    }

    // Handle 'index' segments at the end (skip only if there are path segments,
    // otherwise root index is handled by the early return above)
    if (segment === 'index' && i === segments.length - 1 && pathSegments.length > 0) {
      isIndexRoute = true;
      continue;
    }

    if (segment === '$') {
      pathSegments.push(':*');
      isDynamic = true;
      continue;
    }

    if (segment.startsWith('$')) {
      const paramName = segment.substring(1);
      pathSegments.push(`:${paramName}`);
      isDynamic = true;
    } else if (segment !== 'index') {
      pathSegments.push(segment);
    }
  }

  // If all segments were skipped AND it's not an index route,
  // it's a pathless layout route (like _layout.tsx, _auth.tsx) - exclude from manifest
  if (pathSegments.length === 0 && !isIndexRoute) {
    return null;
  }

  const path = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
  return { path, isDynamic };
}

/**
 * Build a regex pattern for a dynamic route
 */
function buildRegexForDynamicRoute(routePath: string): { regex: string; paramNames: string[] } {
  const segments = routePath.split('/').filter(Boolean);
  const regexSegments: string[] = [];
  const paramNames: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const paramName = segment.substring(1);

      if (paramName.endsWith('*')) {
        const cleanParamName = paramName.slice(0, -1);
        paramNames.push(cleanParamName);
        regexSegments.push('(.+)');
      } else {
        paramNames.push(paramName);
        regexSegments.push('([^/]+)');
      }
    } else {
      regexSegments.push(segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }

  const pattern = `^/${regexSegments.join('/')}$`;

  return { regex: pattern, paramNames };
}

/**
 * Scan the routes directory and build the manifest, recursively processing subdirectories
 *
 * @param routesDir - The directory to scan for route files
 * @param prefix - Path prefix for nested routes (used internally for recursion)
 * @returns Object containing arrays of dynamic and static routes
 */
function scanRoutesDirectory(
  routesDir: string,
  prefix: string = '',
): { dynamicRoutes: RouteInfo[]; staticRoutes: RouteInfo[] } {
  const dynamicRoutes: RouteInfo[] = [];
  const staticRoutes: RouteInfo[] = [];

  try {
    if (!fs.existsSync(routesDir)) {
      return { dynamicRoutes, staticRoutes };
    }

    const entries = fs.readdirSync(routesDir);

    for (const entry of entries) {
      const fullPath = path.join(routesDir, entry);
      const stat = fs.lstatSync(fullPath);

      if (stat.isDirectory()) {
        const nestedPrefix = prefix ? `${prefix}/${entry}` : entry;
        const nested = scanRoutesDirectory(fullPath, nestedPrefix);
        dynamicRoutes.push(...nested.dynamicRoutes);
        staticRoutes.push(...nested.staticRoutes);
      } else if (stat.isFile() && isRouteFile(entry)) {
        const routeName = prefix ? `${prefix}/${entry}` : entry;
        const result = convertRemixRouteToPath(routeName);

        // Skip pathless layout routes (e.g., _layout.tsx, _auth.tsx)
        if (result === null) {
          continue;
        }

        const { path: routePath, isDynamic } = result;

        if (isDynamic) {
          const { regex, paramNames } = buildRegexForDynamicRoute(routePath);
          dynamicRoutes.push({
            path: routePath,
            regex,
            paramNames,
          });
        } else {
          staticRoutes.push({
            path: routePath,
          });
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error building Remix route manifest:', error);
  }

  return { dynamicRoutes, staticRoutes };
}

/**
 * Scans Remix routes directory and generates a manifest containing all static
 * and dynamic routes with their regex patterns for client-side route parameterization.
 *
 * @param options - Configuration options
 * @param options.appDirPath - Path to the app directory (where routes folder is located)
 * @param options.rootDir - The root directory of the project (defaults to process.cwd())
 * @returns A RouteManifest containing arrays of dynamic and static routes
 */
export function createRemixRouteManifest(options?: CreateRemixRouteManifestOptions): RouteManifest {
  const rootDir = options?.rootDir || process.cwd();
  let appDirPath: string | undefined;

  if (options?.appDirPath) {
    appDirPath = options.appDirPath;
  } else {
    const maybeAppDirPath = path.join(rootDir, 'app');

    if (fs.existsSync(maybeAppDirPath) && fs.lstatSync(maybeAppDirPath).isDirectory()) {
      appDirPath = maybeAppDirPath;
    }
  }

  if (!appDirPath) {
    return {
      dynamicRoutes: [],
      staticRoutes: [],
    };
  }

  if (manifestCache && lastAppDirPath === appDirPath) {
    return manifestCache;
  }

  const routesDir = path.join(appDirPath, 'routes');
  const { dynamicRoutes, staticRoutes } = scanRoutesDirectory(routesDir);

  const manifest: RouteManifest = {
    dynamicRoutes,
    staticRoutes,
  };

  manifestCache = manifest;
  lastAppDirPath = appDirPath;

  return manifest;
}
