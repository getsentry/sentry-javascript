import { GLOBAL_OBJ } from '@sentry/core';

/**
 * Subset of ServerBuild shape for middleware name lookup.
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
