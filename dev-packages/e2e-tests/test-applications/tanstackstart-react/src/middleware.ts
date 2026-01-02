import { createMiddleware } from '@tanstack/react-start';
import { wrapMiddlewareWithSentry, wrapMiddlewareListWithSentry } from '@sentry/tanstackstart-react';

// Global request middleware - runs on every request
const globalRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Global request middleware executed');
  return next();
});

// Global function middleware - runs on every server function
const globalFunctionMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('Global function middleware executed');
  return next();
});

// Server function specific middleware
const serverFnMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('Server function middleware executed');
  return next();
});

// Server route specific request middleware
const serverRouteRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Server route request middleware executed');
  return next();
});

// Wrap global request middleware
export const wrappedGlobalRequestMiddleware = wrapMiddlewareWithSentry(globalRequestMiddleware, {
  name: 'globalRequestMiddleware',
});

// Wrap global function middleware
export const wrappedGlobalFunctionMiddleware = wrapMiddlewareWithSentry(globalFunctionMiddleware, {
  name: 'globalFunctionMiddleware',
});

// Wrap server function middleware using list wrapper
export const [wrappedServerFnMiddleware, wrappedServerRouteRequestMiddleware] = wrapMiddlewareListWithSentry({
  serverFnMiddleware,
  serverRouteRequestMiddleware,
});
