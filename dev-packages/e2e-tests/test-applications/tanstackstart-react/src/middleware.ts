import { createMiddleware } from '@tanstack/react-start';
import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';

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

// Server function middleware
const serverFnMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('Server function middleware executed');
  return next();
});

// Server route request middleware
const serverRouteRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Server route request middleware executed');
  return next();
});

// Manually wrap middlewares with Sentry
export const [
  wrappedGlobalRequestMiddleware,
  wrappedGlobalFunctionMiddleware,
  wrappedServerFnMiddleware,
  wrappedServerRouteRequestMiddleware,
] = wrapMiddlewaresWithSentry({
  globalRequestMiddleware,
  globalFunctionMiddleware,
  serverFnMiddleware,
  serverRouteRequestMiddleware,
});
