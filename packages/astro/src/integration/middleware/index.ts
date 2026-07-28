import { handleRequest } from '../../server/middleware';

type MiddlewareNext = () => Promise<Response>;
type MiddlewareHandler = (ctx: unknown, next: MiddlewareNext) => Promise<Response> | Response | Promise<void> | void;

/**
 * This export is used by our integration to automatically add the middleware.
 *
 * It's not possible to pass options at this moment, so we'll call our middleware
 * factory function with the default options. Users can deactivate the automatic
 * middleware registration in our integration and manually add it in their own
 * `/src/middleware.js` file.
 */
export const onRequest: MiddlewareHandler = (ctx, next) => {
  const middleware = handleRequest();

  // `onRequest` deliberately uses framework-agnostic parameter types so the published
  // `@sentry/astro/middleware` declaration does not reference Astro's own types, which are
  // shaped differently across the Astro majors we support. The handler returned by
  // `handleRequest()` is typed against Astro's types, so we cast back to its expected
  // parameter types here – the runtime shapes are identical.
  return middleware(ctx as Parameters<typeof middleware>[0], next);
};
