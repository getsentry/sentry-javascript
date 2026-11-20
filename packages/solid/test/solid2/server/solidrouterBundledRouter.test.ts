import { createRouter } from '@solidjs/router';
import { renderToString } from '@solidjs/web';
import { createComponent } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { withSentryRouterRouting } from '../../../src/solid2/solidrouter';

// In a built app, the server bundle can hold a different copy of `@solidjs/router` than the one the SDK imports,
// and the SDK's copy then finds no router. Hooks that throw stand in for that copy.
vi.mock('@solidjs/router', async importOriginal => {
  const notInRouter = (): never => {
    throw new Error('No router found');
  };
  return {
    ...(await importOriginal<object>()),
    useBeforeLeave: notInRouter,
    useLocation: notInRouter,
    useRouteMatches: notInRouter,
  };
});

describe('withSentryRouterRouting (server, bundled router)', () => {
  it('renders the matched route without using router hooks', () => {
    const Router = withSentryRouterRouting(
      createRouter({ routes: [{ path: '/user/:id', component: () => 'User page' }] }),
    );

    const html = renderToString(() => createComponent(Router, { url: 'http://localhost/user/5' }));

    expect(html).toContain('User page');
  });
});
