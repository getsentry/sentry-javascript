import { describe, expect, it } from 'vitest';
import { createVueRouteProvider, getRouterFromApp } from '../src/routeProvider';
import type { Route } from '../src/router';

function makeRoute(overrides: Partial<Route> = {}): Route {
  return { path: '/users/42', query: {}, params: {}, matched: [{ path: '/users/:id' }], ...overrides };
}

/** Vue Router 4+ returns the route itself. */
const v4Router = (route: Route | undefined) => ({ resolve: () => route as Route });
/** Vue Router 3 wraps it in `{ route }`. */
const v3Router = (route: Route) => ({ resolve: () => ({ route }) });

/** A Vue 3 app with `vue-router` installed, which sets `config.globalProperties.$router`. */
const appWithRouter = (router: unknown) => ({ config: { globalProperties: { $router: router } } });

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
    expect(getRouterFromApp({ config: { globalProperties: {} } })).toBeUndefined();
    expect(getRouterFromApp(undefined)).toBeUndefined();
  });
});

describe('createVueRouteProvider', () => {
  it('resolves the matched path for Vue Router 4+', () => {
    const provider = createVueRouteProvider(() => v4Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
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
    const provider = createVueRouteProvider(() => v4Router(makeRoute({ matched: [] })));

    expect(provider.resolveRoute(new URL('https://example.com/nope'))).toBeUndefined();
  });
});
