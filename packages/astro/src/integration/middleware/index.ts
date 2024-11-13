import type { MiddlewareResponseHandler } from 'astro';

import { handleRequest } from '../../server/middleware';

/**
 * This export is used by our integration to automatically add the middleware
 * to astro ^3.5.0 projects.
 *
 * It's not possible to pass options at this moment, so we'll call our middleware
 * factory function with the default options. Users can deactivate the automatic
 * middleware registration in our integration and manually add it in their own
 * `/src/middleware.js` file.
 */
export const onRequest: MiddlewareResponseHandler = (ctx, next) => {
  return handleRequest()(ctx, next);
};
