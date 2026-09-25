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

export const router = createRouter<AppContext>({
  middleware: [renderMiddleware],
});

router.map(routes, controller);
