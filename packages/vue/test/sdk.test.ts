import { getRouteProvider, resolveRoute } from '@sentry/browser';
import { getMainCarrier } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vueIntegration } from '../src/integration';
import { init } from '../src/sdk';
import type { Vue } from '../src/types';

const DSN = 'https://public@dsn.ingest.sentry.io/1337';

const router = { resolve: () => ({ matched: [{ path: '/users/:id' }] }) };

const app = {
  config: { globalProperties: { $router: router } },
  mixin: vi.fn(),
} as unknown as Vue;

describe('route provider registration', () => {
  afterEach(() => {
    vi.clearAllMocks();
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('registers a route provider that reads the router off the app passed to `init`', () => {
    const client = init({ dsn: DSN, app, defaultIntegrations: false, integrations: [vueIntegration()] });

    expect(resolveRoute('https://example.com/users/42', client)).toBe('/users/:id');
  });

  it('registers a route provider when the app is passed to `vueIntegration`', () => {
    const client = init({ dsn: DSN, defaultIntegrations: false, integrations: [vueIntegration({ app })] });

    expect(resolveRoute('https://example.com/users/42', client)).toBe('/users/:id');
  });

  it('registers a route provider that picks the router up from the Vue 2 root instance', () => {
    let beforeCreate: (this: unknown) => void = () => {};
    const Vue2 = {
      config: {},
      mixin: (mixin: { beforeCreate: typeof beforeCreate }) => {
        beforeCreate = mixin.beforeCreate;
      },
    } as unknown as Vue;
    const client = init({ dsn: DSN, Vue: Vue2, defaultIntegrations: false, integrations: [vueIntegration()] });

    expect(resolveRoute('https://example.com/users/42', client)).toBeUndefined();

    beforeCreate.call({ $options: { router } });
    expect(resolveRoute('https://example.com/users/42', client)).toBe('/users/:id');
  });

  it('does not register a route provider without an app to read the router from', () => {
    const client = init({ dsn: DSN, defaultIntegrations: false, integrations: [vueIntegration()] });

    expect(getRouteProvider(client)).toBeUndefined();
  });

  it('keeps a route provider passed by the user', () => {
    const routeProvider = { resolveRoute: () => '/custom', resolveCurrentRoute: () => '/custom' };
    const client = init({ dsn: DSN, app, routeProvider, defaultIntegrations: false, integrations: [vueIntegration()] });

    expect(getRouteProvider(client)).toBe(routeProvider);
  });
});
