// Main exports from instrumentation
export type { ReactRouterOptions } from './instrumentation';
export {
  createReactRouterV6CompatibleTracingIntegration,
  createV6CompatibleWithSentryReactRouterRouting,
  createV6CompatibleWrapCreateBrowserRouter,
  createV6CompatibleWrapCreateMemoryRouter,
  createV6CompatibleWrapUseRoutes,
  handleNavigation,
  handleExistingNavigationSpan,
  createNewNavigationSpan,
  addResolvedRoutesToParent,
} from './instrumentation';

// Utility exports
export {
  initializeRouterUtils,
  prefixWithSlash,
  rebuildRoutePathFromAllRoutes,
  locationIsInsideDescendantRoute,
  getNormalizedName,
  resolveRouteNameAndSource,
  pathEndsWithWildcard,
  pathIsWildcardAndHasChildren,
} from './utils';

// Lazy route exports
export {
  updateNavigationSpanWithLazyRoutes,
  createAsyncHandlerProxy,
  handleAsyncHandlerResult,
  checkRouteForAsyncHandler,
} from './lazy-routes';
