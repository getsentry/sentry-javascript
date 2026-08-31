import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRemixRouteProvider } from '../../src/client/routeProvider';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRemixRouteManifest: string | undefined;
};

const MANIFEST = JSON.stringify({
  staticRoutes: [{ path: '/about' }],
  dynamicRoutes: [{ path: '/users/:id', regex: '^/users/([^/]+)$', paramNames: ['id'] }],
});

let originalDocument: unknown;

describe('createRemixRouteProvider', () => {
  beforeEach(() => {
    globalWithInjectedManifest._sentryRemixRouteManifest = MANIFEST;
    originalDocument = (GLOBAL_OBJ as { document?: unknown }).document;
    // `resolveCurrentRoute` reads `document.location.href`.
    (GLOBAL_OBJ as { document?: unknown }).document = { location: { href: 'https://example.com/users/42' } };
  });

  afterEach(() => {
    globalWithInjectedManifest._sentryRemixRouteManifest = undefined;
    (GLOBAL_OBJ as { document?: unknown }).document = originalDocument;
  });

  it('parameterizes a URL from the build-time manifest', () => {
    expect(createRemixRouteProvider().resolveRoute(new URL('https://example.com/users/42'))).toBe('/users/:id');
  });

  it('resolves a static route', () => {
    expect(createRemixRouteProvider().resolveRoute(new URL('https://example.com/about'))).toBe('/about');
  });

  it('resolves the current route from the document location', () => {
    expect(createRemixRouteProvider().resolveCurrentRoute()).toBe('/users/:id');
  });

  it('returns undefined for a URL the manifest does not know', () => {
    expect(createRemixRouteProvider().resolveRoute(new URL('https://example.com/nope/deep'))).toBeUndefined();
  });

  it('returns undefined when the manifest was never injected', () => {
    globalWithInjectedManifest._sentryRemixRouteManifest = undefined;

    expect(createRemixRouteProvider().resolveRoute(new URL('https://example.com/users/42'))).toBeUndefined();
  });
});
