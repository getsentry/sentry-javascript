import { GLOBAL_OBJ, resolveCurrentRoute, resolveRoute, setRouteProvider } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserClient, setCurrentClient } from '@sentry/react';
import { createNextRouteProvider } from '../../src/client/routing/routeProvider';

const globalWithManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRouteManifest?: string };

let originalDocument: unknown;

const MANIFEST = JSON.stringify({
  staticRoutes: [{ path: '/about' }],
  dynamicRoutes: [{ path: '/users/:id', regex: '^/users/([^/]+)$', paramNames: ['id'] }],
  isrRoutes: [],
});

function makeClient(): BrowserClient {
  // Deliberately no integrations at all, so nothing tracing-related can be supplying the route.
  const client = new BrowserClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    integrations: [],
    stackParser: () => [],
    transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
  });
  setCurrentClient(client);
  client.init();

  return client;
}

describe('createNextRouteProvider', () => {
  beforeEach(() => {
    globalWithManifest._sentryRouteManifest = MANIFEST;
    originalDocument = (GLOBAL_OBJ as { document?: unknown }).document;
    // `getLocationHref()` reads `document.location.href`; the listener stubs are only here so
    // `client.init()` does not trip over the stand-in.
    (GLOBAL_OBJ as { document?: unknown }).document = {
      location: { href: 'https://example.com/users/42' },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    delete globalWithManifest._sentryRouteManifest;
    (GLOBAL_OBJ as { document?: unknown }).document = originalDocument;
  });

  it('parameterizes a URL from the build-time manifest', () => {
    const client = makeClient();
    setRouteProvider(createNextRouteProvider(), client);

    expect(resolveRoute('https://example.com/users/42', client)).toBe('/users/:id');
  });

  it('resolves the current route without a tracing integration', () => {
    const client = makeClient();
    setRouteProvider(createNextRouteProvider(), client);

    expect(client.getIntegrationByName('BrowserTracing')).toBeUndefined();
    expect(resolveCurrentRoute(client)).toBe('/users/:id');
  });

  it('returns undefined for a URL the manifest does not know', () => {
    const client = makeClient();
    setRouteProvider(createNextRouteProvider(), client);

    expect(resolveRoute('https://example.com/nope/deep', client)).toBeUndefined();
  });
});
