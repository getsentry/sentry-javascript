import { SDK_VERSION } from '@sentry/solid';
import * as SentrySolid from '@sentry/solid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init as solidStartInit } from '../../src/client';
import { solidRouterBrowserTracingIntegration } from '../../src/client/solidrouter';

const browserInit = vi.spyOn(SentrySolid, 'init');

describe('Initialize Solid Start SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
            infer_ip: 'never',
          },
        },
      },
    };

    expect(client).not.toBeUndefined();
    expect(browserInit).toHaveBeenCalledTimes(1);
    expect(browserInit).toHaveBeenLastCalledWith(expect.objectContaining(expectedMetadata));
  });
});

describe('browserTracingIntegration', () => {
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
