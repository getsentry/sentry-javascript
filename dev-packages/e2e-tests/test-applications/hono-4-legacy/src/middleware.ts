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

let failingMiddlewareCount = 0;
export const failingMiddleware: MiddlewareHandler = async function (_c, _next) {
  // Each throw gets a unique suffix so the Dedupe integration doesn't collapse the identical errors
  // that several tests (and their retries) trigger through this shared middleware — otherwise only the
  // first would be reported and the other tests' `waitForError` would time out. Tests match on the
  // stable `Middleware error` prefix.
  throw new Error(`Middleware error #${(failingMiddlewareCount += 1)}`);
};

// Intentionally a NAMED function expression (unlike the anonymous ones above) so the named-function
// path stays covered: the span name is taken from the function's own name. Under bundled Bun the inner
// name collides with the `const` binding and is suffixed (→ `namedMiddleware2`), so the test matches on
// the `namedMiddleware` prefix rather than an exact name.
export const namedMiddleware: MiddlewareHandler = async function namedMiddleware(_c, next) {
  await next();
};
