import { handleRequest } from '../../server/middleware';

type MiddlewareNext = (rewritePayload?: unknown) => Promise<Response>;
type MiddlewareHandler = (
  ctx: unknown,
  next: MiddlewareNext,
) => Promise<Response> | Response | Promise<void> | void;

/**
 * This export is used by our integration to automatically add the middleware
 * to astro ^3.5.0 projects.
 *
 * It's not possible to pass options at this moment, so we'll call our middleware
 * factory function with the default options. Users can deactivate the automatic
 * middleware registration in our integration and manually add it in their own
 * `/src/middleware.js` file.
 */
export const onRequest: MiddlewareHandler = (ctx, next) => {
  const middleware = handleRequest();

  return middleware(
    ctx as Parameters<typeof middleware>[0],
    next as Parameters<typeof middleware>[1],
  );
};
