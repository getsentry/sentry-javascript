import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Route } from '../src/router';
import { createVueRouteProvider } from '../src/router';

function makeRoute(overrides: Partial<Route> = {}): Route {
  return { path: '/users/42', query: {}, params: {}, matched: [{ path: '/users/:id' }], ...overrides };
}

/** Vue Router 4+ returns the route itself. */
function makeV4Router(route: Route | undefined) {
  return { onError: () => {}, beforeEach: () => {}, resolve: () => route as Route };
}

/** Vue Router 3 wraps the route in `{ route }` and exposes `mode`. */
function makeV3Router(route: Route) {
  return { onError: () => {}, beforeEach: () => {}, mode: 'history', resolve: () => ({ route }) };
}

describe('createVueRouteProvider', () => {
  beforeEach(() => {
    (GLOBAL_OBJ as { document?: unknown }).document = { location: { href: 'https://example.com/users/42' } };
  });

  afterEach(() => {
    delete (GLOBAL_OBJ as { document?: unknown }).document;
  });

  it('returns the matched path even for a named route, since a name is not a template', () => {
    const provider = createVueRouteProvider(makeV4Router(makeRoute({ name: 'UserProfile' })));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('resolves the matched route path for Vue Router 4+', () => {
    const provider = createVueRouteProvider(makeV4Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('unwraps the `{ route }` shape Vue Router 3 resolves to', () => {
    const provider = createVueRouteProvider(makeV3Router(makeRoute()));

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('returns undefined when the router cannot resolve', () => {
    const provider = createVueRouteProvider(makeV4Router(undefined));

    expect(provider.resolveRoute(new URL('https://example.com/nope'))).toBeUndefined();
  });

  // `VueRouter` is a hand-rolled structural interface spanning Vue Router 2, 3 and 4+, so `resolve`
  // is treated as optional rather than assumed present on every router the user passes in.
  it('returns undefined for a router that exposes no `resolve`', () => {
    const provider = createVueRouteProvider({ onError: () => {}, beforeEach: () => {} });

    expect(provider.resolveRoute(new URL('https://example.com/users/42'))).toBeUndefined();
  });

  it('resolves the current route from the document location', () => {
    const provider = createVueRouteProvider(makeV4Router(makeRoute()));

    expect(provider.resolveCurrentRoute()).toBe('/users/:id');
  });
});
