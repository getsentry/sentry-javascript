// Hono stores the original (unwrapped) handler under this key when it wraps a sub-app's handlers
// for a custom `onError`. Unwrapping it lets us inspect the real handler instead of the wrapper.
// See https://github.com/honojs/hono/blob/9f0dadf141a3242a6c3b77462c7d33c6ce0f599d/src/hono-base.ts#L224-L226
const COMPOSED_HANDLER = '__COMPOSED_HANDLER';

/**
 * Infers whether a Hono route entry is a middleware (rather than a route handler).
 *
 * Hono has no "isMiddleware" flag, so we rely on arity: middleware is `(context, next)` (arity >= 2)
 * while route handlers are `(context)` (arity < 2). `onError`-wrapped sub-app handlers are unwrapped
 * first so we check the original handler's arity, not the wrapper's `(c, next)` signature.
 * https://github.com/honojs/hono/blob/97c6fe1f12298c715eb7b2da65b4b6e0d81682bb/src/utils/handler.ts#L8
 *
 * This is only one signal — callers that must classify inline middleware sharing a method+path with
 * their handler (e.g. `wrapSubAppMiddleware`) additionally need positional information.
 */
export function isMiddleware(handler: unknown): boolean {
  if (typeof handler !== 'function') {
    return false;
  }

  const composed = (handler as unknown as Record<string, unknown>)[COMPOSED_HANDLER];
  const original = typeof composed === 'function' ? composed : handler;

  return (original as (...args: unknown[]) => unknown).length >= 2;
}
