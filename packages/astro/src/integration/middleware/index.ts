import { handleRequest } from '../../server/middleware';

type MiddlewareNext = () => Promise<Response>;
type MiddlewareHandler = (ctx: unknown, next: MiddlewareNext) => Promise<Response> | Response | Promise<void> | void;

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

  // `onRequest` deliberately uses framework-agnostic parameter types so the published
  // `@sentry/astro/middleware` declaration does not reference Astro-version-specific types
  // (e.g. `MiddlewareResponseHandler`, which is absent in some supported Astro versions).
  // The handler returned by `handleRequest()` is typed against Astro's own types, so we cast
  // back to its expected parameter types here – the runtime shapes are identical.
  return middleware(ctx as Parameters<typeof middleware>[0], next as Parameters<typeof middleware>[1]);
};
