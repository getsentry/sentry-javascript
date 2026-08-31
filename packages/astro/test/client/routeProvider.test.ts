import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAstroRouteProvider } from '../../src/client/routeProvider';

let originalDocument: unknown;
let originalLocation: unknown;

/** Mirrors what the Astro middleware injects: an encoded route on a `sentry-route-name` meta tag. */
function renderPage(pathname: string, routeName: string | undefined): void {
  const meta = routeName
    ? { getAttribute: (attr: string) => (attr === 'content' ? encodeURIComponent(routeName) : null) }
    : null;

  (GLOBAL_OBJ as { document?: unknown }).document = {
    querySelector: (selector: string) => (selector === 'meta[name=sentry-route-name]' ? meta : null),
  };
  (GLOBAL_OBJ as { location?: unknown }).location = { pathname };
}

describe('createAstroRouteProvider', () => {
  beforeEach(() => {
    originalDocument = (GLOBAL_OBJ as { document?: unknown }).document;
    originalLocation = (GLOBAL_OBJ as { location?: unknown }).location;
  });

  afterEach(() => {
    (GLOBAL_OBJ as { document?: unknown }).document = originalDocument;
    (GLOBAL_OBJ as { location?: unknown }).location = originalLocation;
  });

  it('resolves the current route from the meta tag', () => {
    renderPage('/users/1', '/users/[id]');

    expect(createAstroRouteProvider().resolveCurrentRoute()).toBe('/users/[id]');
  });

  it('resolves a URL that is the current page', () => {
    renderPage('/users/1', '/users/[id]');

    expect(createAstroRouteProvider().resolveRoute(new URL('https://example.com/users/1'))).toBe('/users/[id]');
  });

  it('refuses to answer for a URL that is not the current page', () => {
    renderPage('/users/1', '/users/[id]');

    // The document only ever describes the page it rendered, so guessing here would be wrong. This is
    // also what keeps a navigation from being named after the route it is leaving.
    expect(createAstroRouteProvider().resolveRoute(new URL('https://example.com/posts/hello'))).toBeUndefined();
  });

  it('follows a client-side navigation, since the meta tag is swapped with the document', () => {
    const provider = createAstroRouteProvider();
    renderPage('/users/1', '/users/[id]');
    expect(provider.resolveCurrentRoute()).toBe('/users/[id]');

    renderPage('/posts/hello', '/posts/[slug]');
    expect(provider.resolveCurrentRoute()).toBe('/posts/[slug]');
  });

  it('returns undefined when the middleware injected no route', () => {
    renderPage('/users/1', undefined);

    expect(createAstroRouteProvider().resolveCurrentRoute()).toBeUndefined();
  });
});
