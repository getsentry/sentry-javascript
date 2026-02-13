/**
 * Loose type for ServerBuild to access middleware properties
 * that may not be in the official React Router types.
 * @internal
 */
interface ServerBuildLike {
  routes?: Record<
    string,
    {
      id?: string;
      module?: {
        middleware?: Array<{ name?: string }>;
      };
    }
  >;
}

// ServerBuild reference for middleware name lookup. Updated on each createRequestHandler call.
let _serverBuild: ServerBuildLike | undefined;

/**
 * Type guard to check if an object is a ServerBuild-like structure.
 * @internal
 */
export function isServerBuildLike(build: unknown): build is ServerBuildLike {
  if (build === null || typeof build !== 'object' || !('routes' in build)) {
    return false;
  }
  const routes = (build as { routes: unknown }).routes;
  return routes !== null && typeof routes === 'object';
}

/**
 * Stores reference to the React Router ServerBuild.
 * Called when createRequestHandler is invoked.
 * @internal
 */
export function setServerBuild(build: ServerBuildLike): void {
  _serverBuild = build;
}

/**
 * Looks up a middleware function name from the ServerBuild.
 * @param routeId - The route ID
 * @param index - The middleware function index within the route's middleware array
 * @returns The middleware function name if available, undefined otherwise
 * @internal
 */
export function getMiddlewareName(routeId: string, index: number): string | undefined {
  if (!_serverBuild?.routes) return undefined;

  const route = _serverBuild.routes[routeId];
  if (!route?.module?.middleware) return undefined;

  const middlewareFn = route.module.middleware[index];
  return middlewareFn?.name || undefined;
}

/**
 * Clears the stored ServerBuild reference.
 * Only used for testing purposes.
 * @internal
 */
export function _resetServerBuild(): void {
  _serverBuild = undefined;
}
