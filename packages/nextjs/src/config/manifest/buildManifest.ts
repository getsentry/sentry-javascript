import * as fs from 'fs';
import * as path from 'path';

export type RouteInfo = {
  path: string;
  dynamic: boolean;
  pattern?: string;
  paramNames?: string[];
};

export type RouteManifest = {
  dynamic: RouteInfo[];
  static: RouteInfo[];
};

export type CreateRouteManifestOptions = {
  // For starters we only support app router
  appDirPath?: string;
};

let manifestCache: RouteManifest | null = null;
let lastAppDirPath: string | null = null;

function isPageFile(filename: string): boolean {
  return filename === 'page.tsx' || filename === 'page.jsx' || filename === 'page.ts' || filename === 'page.js';
}

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
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

function buildRegexForDynamicRoute(routePath: string): { pattern: string; paramNames: string[] } {
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
      // Static segment
      regexSegments.push(segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }

  let pattern: string;
  if (hasOptionalCatchall) {
    // For optional catchall, make the trailing slash and segments optional
    // This allows matching both /catchall and /catchall/anything
    const staticParts = regexSegments.join('/');
    pattern = `^/${staticParts}(?:/(.*))?$`;
  } else {
    pattern = `^/${regexSegments.join('/')}$`;
  }

  return { pattern, paramNames };
}

function scanAppDirectory(dir: string, basePath: string = ''): RouteInfo[] {
  const routes: RouteInfo[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const pageFile = entries.some(entry => isPageFile(entry.name));

    if (pageFile) {
      const routePath = basePath || '/';
      const isDynamic = routePath.includes(':');

      if (isDynamic) {
        const { pattern, paramNames } = buildRegexForDynamicRoute(routePath);
        routes.push({
          path: routePath,
          dynamic: true,
          pattern,
          paramNames,
        });
      } else {
        routes.push({
          path: routePath,
          dynamic: false,
        });
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(dir, entry.name);

        if (isRouteGroup(entry.name)) {
          // Route groups don't affect the URL, just scan them
          const subRoutes = scanAppDirectory(fullPath, basePath);
          routes.push(...subRoutes);
          continue;
        }

        const isDynamic = entry.name.startsWith('[') && entry.name.endsWith(']');
        let routeSegment: string;

        if (isDynamic) {
          routeSegment = getDynamicRouteSegment(entry.name);
        } else {
          routeSegment = entry.name;
        }

        const newBasePath = `${basePath}/${routeSegment}`;
        const subRoutes = scanAppDirectory(fullPath, newBasePath);
        routes.push(...subRoutes);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error building route manifest:', error);
  }

  return routes;
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
      dynamic: [],
      static: [],
    };
  }

  // Check if we can use cached version
  if (manifestCache && lastAppDirPath === targetDir) {
    return manifestCache;
  }

  const routes = scanAppDirectory(targetDir);

  const manifest: RouteManifest = {
    dynamic: routes.filter(route => route.dynamic),
    static: routes.filter(route => !route.dynamic),
  };

  // set cache
  manifestCache = manifest;
  lastAppDirPath = targetDir;

  return manifest;
}
