import { createMiddleware } from '@tanstack/react-start';

// Global request middleware - runs on every request
// NOTE: This is exported unwrapped to test auto-instrumentation via the Vite plugin
export const globalRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Global request middleware executed');
  return next();
});

// Global function middleware - runs on every server function
// NOTE: This is exported unwrapped to test auto-instrumentation via the Vite plugin
export const globalFunctionMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('Global function middleware executed');
  return next();
});

// Server function middleware - exported unwrapped for auto-instrumentation via Vite plugin
export const serverFnMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  console.log('Server function middleware executed');
  return next();
});

// Server route request middleware - exported unwrapped for auto-instrumentation via Vite plugin
export const serverRouteRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Server route request middleware executed');
  return next();
});

// Early return middleware - returns without calling next()
// Exported unwrapped for auto-instrumentation via Vite plugin
export const earlyReturnMiddleware = createMiddleware({ type: 'function' }).server(async () => {
  console.log('Early return middleware executed - not calling next()');
  return { earlyReturn: true, message: 'Middleware returned early without calling next()' };
});

// Error middleware - throws an exception
// Exported unwrapped for auto-instrumentation via Vite plugin
export const errorMiddleware = createMiddleware({ type: 'function' }).server(async () => {
  console.log('Error middleware executed - throwing error');
  throw new Error('Middleware Error Test');
});
