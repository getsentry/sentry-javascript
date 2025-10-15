import * as fs from 'fs';
import * as path from 'path';
import type { RouteInfo, RouteManifest } from './types';

export type CreateRouteManifestOptions = {
  // For starters we only support app router
  appDirPath?: string;
  /**
   * Whether to include route groups (e.g., (auth-layout)) in the final route paths.
   * By default, route groups are stripped from paths following Next.js convention.
   */
  includeRouteGroups?: boolean;
  /**
   * Base path for the application, if any. This will be prefixed to all routes.
   */
  basePath?: string;
};

let manifestCache: RouteManifest | null = null;
let lastAppDirPath: string | null = null;
let lastIncludeRouteGroups: boolean | undefined = undefined;

function isPageFile(filename: string): boolean {
  return filename === 'page.tsx' || filename === 'page.jsx' || filename === 'page.ts' || filename === 'page.js';
}

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

function normalizeRoutePath(routePath: string): string {
  // Remove route group segments from the path
  return routePath.replace(/\/\([^)]+\)/g, '');
}

function getDynamicRouteSegment(name: string): string {
  if (name.startsWith('[[...') && name.endsWith(']]')) {
    // Optional catchall: [[...param]]
    const paramName = name.slice(5, -2); // Remove [[... and ]]
    return `:${paramName}*?`; // Mark with ? as optional
  } else if (name.startsWith('[...') && name.endsWith(']')) {
    // Required catchall: [...param]
    const paramName = name.slice(4, -1); // Remove [... and ]
    return `:${paramName}*`;
  }
  // Regular dynamic: [param]
  return `:${name.slice(1, -1)}`;
}

function buildRegexForDynamicRoute(routePath: string): { regex: string; paramNames: string[] } {
  const segments = routePath.split('/').filter(Boolean);
  const regexSegments: string[] = [];
  const paramNames: string[] = [];
  let hasOptionalCatchall = false;

  for (const segment of segments) {
    if (segment.startsWith(':')) {
      const paramName = segment.substring(1);

      if (paramName.endsWith('*?')) {
        // Optional catchall: matches zero or more segments
        const cleanParamName = paramName.slice(0, -2);
        paramNames.push(cleanParamName);
        // Handling this special case in pattern construction below
        hasOptionalCatchall = true;
      } else if (paramName.endsWith('*')) {
        // Required catchall: matches one or more segments
        const cleanParamName = paramName.slice(0, -1);
        paramNames.push(cleanParamName);
        regexSegments.push('(.+)');
      } else {
        // Regular dynamic segment
        paramNames.push(paramName);
        regexSegments.push('([^/]+)');
      }
    } else {
      // Static segment - escape regex special characters including route group parentheses
      regexSegments.push(segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }

  let pattern: string;
  if (hasOptionalCatchall) {
    if (regexSegments.length === 0) {
      // If the optional catchall happens at the root, accept any path starting
      // with a slash. Need capturing group for parameter extraction.
      pattern = '^/(.*)$';
    } else {
      // For optional catchall, make the trailing slash and segments optional
      // This allows matching both /catchall and /catchall/anything
      const staticParts = regexSegments.join('/');
      pattern = `^/${staticParts}(?:/(.*))?$`;
    }
  } else {
    pattern = `^/${regexSegments.join('/')}$`;
  }

  return { regex: pattern, paramNames };
}

function scanAppDirectory(
  dir: string,
  basePath: string = '',
  includeRouteGroups: boolean = false,
): { dynamicRoutes: RouteInfo[]; staticRoutes: RouteInfo[] } {
  const dynamicRoutes: RouteInfo[] = [];
  const staticRoutes: RouteInfo[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const pageFile = entries.some(entry => isPageFile(entry.name));

    if (pageFile) {
      // Conditionally normalize the path based on includeRouteGroups option
      const routePath = includeRouteGroups ? basePath || '/' : normalizeRoutePath(basePath || '/');
      const isDynamic = routePath.includes(':');

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

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);
        let routeSegment: string;

        const isDynamic = entry.name.startsWith('[') && entry.name.endsWith(']');
        const isRouteGroupDir = isRouteGroup(entry.name);

        if (isRouteGroupDir) {
          if (includeRouteGroups) {
            routeSegment = entry.name;
          } else {
            routeSegment = '';
          }
        } else if (isDynamic) {
          routeSegment = getDynamicRouteSegment(entry.name);
        } else {
          routeSegment = entry.name;
        }

        const newBasePath = routeSegment ? `${basePath}/${routeSegment}` : basePath;
        const subRoutes = scanAppDirectory(fullPath, newBasePath, includeRouteGroups);

        dynamicRoutes.push(...subRoutes.dynamicRoutes);
        staticRoutes.push(...subRoutes.staticRoutes);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error building route manifest:', error);
  }

  return { dynamicRoutes, staticRoutes };
}

/**
 * Returns a route manifest for the given app directory
 */
export function createRouteManifest(options?: CreateRouteManifestOptions): RouteManifest {
  let targetDir: string | undefined;

  if (options?.appDirPath) {
    targetDir = options.appDirPath;
  } else {
    const projectDir = process.cwd();
    const maybeAppDirPath = path.join(projectDir, 'app');
    const maybeSrcAppDirPath = path.join(projectDir, 'src', 'app');

    if (fs.existsSync(maybeAppDirPath) && fs.lstatSync(maybeAppDirPath).isDirectory()) {
      targetDir = maybeAppDirPath;
    } else if (fs.existsSync(maybeSrcAppDirPath) && fs.lstatSync(maybeSrcAppDirPath).isDirectory()) {
      targetDir = maybeSrcAppDirPath;
    }
  }

  if (!targetDir) {
    return {
      dynamicRoutes: [],
      staticRoutes: [],
    };
  }

  // Check if we can use cached version
  if (manifestCache && lastAppDirPath === targetDir && lastIncludeRouteGroups === options?.includeRouteGroups) {
    return manifestCache;
  }

  const { dynamicRoutes, staticRoutes } = scanAppDirectory(targetDir, options?.basePath, options?.includeRouteGroups);

  const manifest: RouteManifest = {
    dynamicRoutes,
    staticRoutes,
  };

  // set cache
  manifestCache = manifest;
  lastAppDirPath = targetDir;
  lastIncludeRouteGroups = options?.includeRouteGroups;

  return manifest;
}
