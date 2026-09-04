import { wrapReactRouterRouting } from '@sentry/react/router';
import { Routes } from 'react-router';

// `wrapReactRouterRouting` runs here, at this module's evaluation time. Because `main.tsx` imports
// this module, that happens BEFORE `main.tsx` calls `Sentry.init()`. This deliberately exercises the
// order-independence of the setup: wrapping the routes before Sentry is initialized still instruments
// navigations once the app renders (the wrapper reads its config at render time, after init).
export const SentryRoutes = wrapReactRouterRouting(Routes);
