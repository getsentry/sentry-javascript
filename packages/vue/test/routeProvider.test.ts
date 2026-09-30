import { describe, expect, it } from 'vitest';
import { createVueRouteProvider, getRouterFromApp } from '../src/routeProvider';
import type { Route } from '../src/router';
import type { Vue } from '../src/types';

function makeRoute(overrides: Partial<Route> = {}): Route {
  return { path: '/users/42', query: {}, params: {}, matched: [{ path: '/users/:id' }], ...overrides };
}

/** Vue Router 4+ returns the route itself. Only `/users/42` matches, so a wrong location resolves to nothing. */
const v4Router = (route: Route | undefined, base = '') => ({
  options: { history: { base } },
  resolve: (to: string) => (to.split('?')[0] === '/users/42' ? route : makeRoute({ matched: [] })) as Route,
});
/** Vue Router 3 wraps it in `{ route }`. */
const v3Router = (route: Route, mode = 'history', base = '') => ({
  mode,
  history: { base },
  resolve: (to: string) => ({ route: to.split('?')[0] === '/users/42' ? route : makeRoute({ matched: [] }) }),
});

/** A Vue 3 app with `vue-router` installed, which sets `config.globalProperties.$router`. */
const appWithRouter = (router: unknown) => ({ config: { globalProperties: { $router: router } } }) as unknown as Vue;

describe('getRouterFromApp', () => {
  it('reads the router vue-router installed on the app', () => {
    const router = v4Router(makeRoute());

    expect(getRouterFromApp(appWithRouter(router))).toBe(router);
  });

  it('reads from the first app when several were passed', () => {
    const router = v4Router(makeRoute());

    expect(getRouterFromApp([appWithRouter(router), appWithRouter(undefined)])).toBe(router);
  });

  it('returns undefined when no router is installed yet', () => {
    expect(getRouterFromApp(appWithRouter(undefined))).toBeUndefined();
    expect(getRouterFromApp(undefined)).toBeUndefined();
  });
});

describe('createVueRouteProvider', () => {
  it('resolves the matched path for Vue Router 4+', () => {
    const provider = createVueRouteProvider(() => v4Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/users/42?tab=1'))).toBe('/users/:id');
  });

  it('unwraps the `{ route }` shape Vue Router 3 resolves to', () => {
    const provider = createVueRouteProvider(() => v3Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('returns the matched path even for a named route, since a name is not a template', () => {
    const provider = createVueRouteProvider(() => v4Router(makeRoute({ name: 'UserProfile' })));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('picks the router up late, since `app.use(router)` may run after `Sentry.init`', () => {
    let router: ReturnType<typeof v4Router> | undefined;
    const provider = createVueRouteProvider(() => router);

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBeUndefined();

    router = v4Router(makeRoute());
    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('returns undefined when nothing matched', () => {
    const provider = createVueRouteProvider(() => v4Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/nope'))).toBeUndefined();
  });

  describe('Vue Router 4+ history base', () => {
    it('strips a non-root base', () => {
      const provider = createVueRouteProvider(() => v4Router(makeRoute(), '/app'));

      expect(provider.resolveRoute(new URL('https://example.com/app/users/42'))).toBe('/users/:id');
    });

    it('resolves from the hash with hash history', () => {
      const provider = createVueRouteProvider(() => v4Router(makeRoute(), '/#'));

      expect(provider.resolveRoute(new URL('https://example.com/#/users/42?tab=1'))).toBe('/users/:id');
      expect(provider.resolveRoute(new URL('https://example.com/'))).toBeUndefined();
    });

    it('resolves from the hash with hash history under a base', () => {
      const provider = createVueRouteProvider(() => v4Router(makeRoute(), '/app/#'));

      expect(provider.resolveRoute(new URL('https://example.com/app/#/users/42'))).toBe('/users/:id');
    });
  });

  describe('Vue Router 3 mode', () => {
    it('strips a non-root base in history mode', () => {
      const provider = createVueRouteProvider(() => v3Router(makeRoute(), 'history', '/app'));

      expect(provider.resolveRoute(new URL('https://example.com/app/users/42'))).toBe('/users/:id');
    });

    it('resolves from the hash in hash mode', () => {
      const provider = createVueRouteProvider(() => v3Router(makeRoute(), 'hash'));

      expect(provider.resolveRoute(new URL('https://example.com/#/users/42'))).toBe('/users/:id');
    });
  });
});
