import { createCachedRouteProvider } from '@sentry/core';

// The Data Router exposes its matches only through router state, and the package has no runtime
// dependency on `react-router` to call `matchRoutes` with. The provider answers from routes the
// hydrated router has already resolved instead.
export const routeProvider = createCachedRouteProvider();
