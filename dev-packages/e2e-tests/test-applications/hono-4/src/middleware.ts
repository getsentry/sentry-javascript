import type { MiddlewareHandler } from 'hono';

// Defined as anonymous function expressions so the function name is inferred from the `const`
// binding. A named expression (`const middlewareA = async function middlewareA() {}`) collides with
// the binding when bundled, and Bun renames the inner function (→ `middlewareA2`), which would then
// surface as the middleware span name. The inferred name stays stable across all runtimes.
export const middlewareA: MiddlewareHandler = async function (c, next) {
  // Add some delay
  await new Promise(resolve => setTimeout(resolve, 50));
  await next();
};

export const middlewareB: MiddlewareHandler = async function (_c, next) {
  // Add some delay
  await new Promise(resolve => setTimeout(resolve, 60));
  await next();
};

export const failingMiddleware: MiddlewareHandler = async function (_c, _next) {
  throw new Error('Middleware error');
};
