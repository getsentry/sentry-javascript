import { createRouter, type MiddlewareContext } from 'remix/router';
import { render } from 'remix/middleware/render';

import controller from './actions/controller.tsx';
import { assets } from './assets.ts';
import { routes } from './routes.ts';

const renderMiddleware = render({ assets });
type AppContext = MiddlewareContext<[typeof renderMiddleware]>;

declare module 'remix/router' {
  interface RouterTypes {
    context: AppContext;
  }
}

// The tunnel variant checks that the managed tunnel answers before an auth middleware like this one.
function authMiddleware(context: { request: Request }, next: () => Promise<Response>): Promise<Response> | Response {
  if (
    process.env.E2E_TEST_TUNNEL &&
    context.request.method === 'POST' &&
    context.request.headers.get('x-auth') !== 'ok'
  ) {
    return new Response('blocked by user auth', { status: 401 });
  }

  return next();
}

export const router = createRouter<AppContext>({
  middleware: [authMiddleware, renderMiddleware],
});

router.map(routes, controller);

// Mounted rather than added to the route map, so the tests cover a route whose pattern carries a mount
// prefix.
router.mount('/api', api => {
  api.get('/items/:itemId', context => Response.json({ itemId: context.params.itemId }));
});
