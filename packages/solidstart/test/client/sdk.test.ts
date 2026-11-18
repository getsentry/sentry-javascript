import { SDK_VERSION } from '@sentry/solid';
import * as SentrySolid from '@sentry/solid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as solidStartInit } from '../../src/client';
import { solidRouterBrowserTracingIntegration } from '../../src/client/solidrouter';

const browserInit = vi.spyOn(SentrySolid, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SentrySolid.getCurrentScope().setClient(undefined);
  });

  it('has the correct metadata', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const expectedMetadata = {
      _metadata: {
        sdk: {
          name: 'sentry.javascript.solidstart',
          packages: [
            { name: 'npm:@sentry/solidstart', version: SDK_VERSION },
            { name: 'npm:@sentry/solid', version: SDK_VERSION },
          ],
          version: SDK_VERSION,
          settings: {
            infer_ip: 'auto',
          },
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });
});

describe('release', () => {
  beforeEach(() => {
    SentrySolid.getCurrentScope().setClient(undefined);
    document.head.innerHTML = '';
    delete SentrySolid.WINDOW.SENTRY_RELEASE;
  });

  it('reads the release from the `<meta>` tag the server adds to the page', () => {
    document.head.innerHTML = '<meta name="sentry-release" content="page-release">';

    const client = solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(client?.getOptions().release).toBe('page-release');
  });

  it('prefers the release passed to `init` over the page', () => {
    document.head.innerHTML = '<meta name="sentry-release" content="page-release">';

    const client = solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337', release: 'init-release' });

    expect(client?.getOptions().release).toBe('init-release');
  });

  it('keeps the release injected into the bundle when the page has none', () => {
    SentrySolid.WINDOW.SENTRY_RELEASE = { id: 'injected-release' };

    const client = solidStartInit({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(client?.getOptions().release).toBe('injected-release');
  });
});

describe('browserTracingIntegration', () => {
  beforeEach(() => {
    SentrySolid.getCurrentScope().setClient(undefined);
  });

  it('adds the `browserTracingIntegration` when `__SENTRY_TRACING__` is not set', () => {
    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const browserTracingIntegration = client
      ?.getOptions()
      .integrations.find(integration => integration.name === 'BrowserTracing');
    expect(browserTracingIntegration).toBeDefined();
    // @ts-expect-error Non public field
    expect(browserTracingIntegration!.isDefaultInstance).toEqual(true);
  });

  it("doesn't add the `browserTracingIntegration` if `__SENTRY_TRACING__` is false", () => {
    // @ts-expect-error Test setup for build-time flag
    globalThis.__SENTRY_TRACING__ = false;

    const client = solidStartInit({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const browserTracingIntegration = client
      ?.getOptions()
      .integrations.find(integration => integration.name === 'BrowserTracing');
    expect(browserTracingIntegration).toBeUndefined();

    // @ts-expect-error Test setup for build-time flag
    delete globalThis.__SENTRY_TRACING__;
  });

  it("doesn't add the default `browserTracingIntegration` if `solidBrowserTracingIntegration` was already passed in", () => {
    const client = solidStartInit({
      integrations: [solidRouterBrowserTracingIntegration()],
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });

    const browserTracingIntegration = client
      ?.getOptions()
      .integrations.find(integration => integration.name === 'BrowserTracing');
    expect(browserTracingIntegration).toBeDefined();
    // @ts-expect-error Non public field
    expect(browserTracingIntegration!.isDefaultInstance).toBeUndefined();
  });
});
