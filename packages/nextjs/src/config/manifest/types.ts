/**
 * Information about a single route in the manifest
 */
export type RouteInfo = {
  /**
   * The parameterised route path, e.g. "/users/[id]"
   */
  path: string;
  /**
   * (Optional) The regex pattern for dynamic routes
   */
  regex?: string;
  /**
   * (Optional) The names of dynamic parameters in the route
   */
  paramNames?: string[];
  /**
   * (Optional) Indicates if the first segment is an optional prefix (e.g., for i18n routing)
   * When true, routes like '/foo' should match '/:locale/foo' patterns
   */
  hasOptionalPrefix?: boolean;
};

/**
 * The manifest containing all routes discovered in the app
 */
export type RouteManifest = {
  /**
   * List of all dynamic routes
   */
  dynamicRoutes: RouteInfo[];

  /**
   * List of all static routes
   */
  staticRoutes: RouteInfo[];

  /**
   * List of ISR/SSG routes (routes with generateStaticParams)
   */
  isrRoutes: string[];
};
