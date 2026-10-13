import { getIsolationScope, GLOBAL_OBJ, parseStringToURLObject } from '@sentry/core';

/**
 * Subset of ServerBuild shape for middleware name lookup and prerender detection.
 * The official React Router types don't expose `middleware` on route modules yet.
 * @internal
 */
interface ServerBuildLike {
  routes?: Record<
    string,
    {
      module?: {
        middleware?: Array<{ name?: string }>;
      };
    }
  >;
  /** The paths React Router prerenders to static HTML at build time. */
  prerender?: string[];
}

/** @internal */
export const GLOBAL_KEY = '__sentrySetServerBuild';

type GlobalObjWithBuildCapture = typeof GLOBAL_OBJ & {
  [GLOBAL_KEY]?: (build: ServerBuildLike) => void;
};

// ServerBuild reference for middleware name lookup. Updated on each createRequestHandler call.
let _serverBuild: ServerBuildLike | undefined;

/** @internal */
export function isServerBuildLike(build: unknown): build is ServerBuildLike {
  return (
    build !== null &&
    typeof build === 'object' &&
    'routes' in build &&
    build.routes !== null &&
    typeof build.routes === 'object'
  );
}

/** @internal */
export function setServerBuild(build: ServerBuildLike): void {
  _serverBuild = build;
}

/** @internal */
export function getMiddlewareName(routeId: string, index: number): string | undefined {
  if (!_serverBuild?.routes) return undefined;

  const route = _serverBuild.routes[routeId];
  if (!route?.module?.middleware) return undefined;

  const middlewareFn = route.module.middleware[index];
  return middlewareFn?.name || undefined;
}

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Whether the current request renders a path from the build's `prerender` list.
 *
 * In production these paths are served as static files and never reach the request handler, so a
 * render of one is the build-time prerender. Trace meta tags must not be written into that HTML:
 * every visitor of the static page would continue the same trace.
 *
 * @internal
 */
export function isPrerenderRequest(): boolean {
  const prerender = _serverBuild?.prerender;
  if (!prerender?.length) return false;

  const url = getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest?.url;
  const pathname = url ? parseStringToURLObject(url)?.pathname : undefined;
  if (!pathname) return false;

  const requestPath = withoutTrailingSlash(pathname);
  return prerender.some(path => withoutTrailingSlash(path) === requestPath);
}

/** @internal */
export function registerServerBuildGlobal(): void {
  (GLOBAL_OBJ as GlobalObjWithBuildCapture)[GLOBAL_KEY] = setServerBuild;
}

/** @internal Exported for testing. */
export function _resetServerBuild(): void {
  _serverBuild = undefined;
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (GLOBAL_OBJ as GlobalObjWithBuildCapture)[GLOBAL_KEY];
}
