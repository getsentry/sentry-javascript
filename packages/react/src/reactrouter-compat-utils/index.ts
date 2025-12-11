// These exports provide utility functions for React Router v6 compatibility (as of now v6 and v7)

// Main exports from instrumentation
export type { ReactRouterOptions } from './instrumentation';
export {
  createReactRouterV6CompatibleTracingIntegration,
  createV6CompatibleWithSentryReactRouterRouting,
  createV6CompatibleWrapCreateBrowserRouter,
  createV6CompatibleWrapCreateMemoryRouter,
  createV6CompatibleWrapUseRoutes,
  handleNavigation,
  addResolvedRoutesToParent,
  processResolvedRoutes,
  updateNavigationSpan,
} from './instrumentation';

// Utility exports
export {
  resolveRouteNameAndSource,
  getNormalizedName,
  initializeRouterUtils,
  locationIsInsideDescendantRoute,
  prefixWithSlash,
  rebuildRoutePathFromAllRoutes,
  pathEndsWithWildcard,
  pathIsWildcardAndHasChildren,
  getNumberOfUrlSegments,
  transactionNameHasWildcard,
  getActiveRootSpan,
  // Navigation context functions (internal use and testing)
  setNavigationContext,
  clearNavigationContext,
  getNavigationContext,
} from './utils';

// Lazy route exports
export { createAsyncHandlerProxy, handleAsyncHandlerResult, checkRouteForAsyncHandler } from './lazy-routes';
