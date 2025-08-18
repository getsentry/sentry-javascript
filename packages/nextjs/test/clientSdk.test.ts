import type { Integration } from '@sentry/core';
import { debug, getGlobalScope, getIsolationScope } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { getClient, getCurrentScope, WINDOW } from '@sentry/react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { breadcrumbsIntegration, browserTracingIntegration, init } from '../src/client';

const reactInit = vi.spyOn(SentryReact, 'init');
const debugLogSpy = vi.spyOn(debug, 'log');

// We're setting up JSDom here because the Next.js routing instrumentations requires a few things to be present on pageload:
// 1. Access to window.document API for `window.document.getElementById`
// 2. Access to window.location API for `window.location.pathname`
const dom = new JSDOM(undefined, { url: 'https://example.com/' });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });
Object.defineProperty(global, 'addEventListener', { value: () => undefined, writable: true });

const originalGlobalDocument = WINDOW.document;
const originalGlobalLocation = WINDOW.location;
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalGlobalAddEventListener = WINDOW.addEventListener;

afterAll(() => {
  // Clean up JSDom
  Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
  Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
  Object.defineProperty(WINDOW, 'addEventListener', { value: originalGlobalAddEventListener });
});

function findIntegrationByName(integrations: Integration[] = [], name: string): Integration | undefined {
  return integrations.find(integration => integration.name === name);
}

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

describe('Client init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
  });

  it('inits the React SDK', () => {
    expect(reactInit).toHaveBeenCalledTimes(0);
    init({});
    expect(reactInit).toHaveBeenCalledTimes(1);
    expect(reactInit).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nextjs',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/nextjs',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/react',
                version: expect.any(String),
              },
            ],
            settings: {
              infer_ip: 'never',
            },
          },
        },
        environment: 'test',
        defaultIntegrations: expect.arrayContaining([
          expect.objectContaining({
            name: 'NextjsClientStackFrameNormalization',
          }),
        ]),
      }),
    );
  });

  it('adds 404 transaction filter', () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const transportSend = vi.spyOn(getClient()!.getTransport()!, 'send');

    // Ensure we have no current span, so our next span is a transaction
    SentryReact.withActiveSpan(null, () => {
      SentryReact.startInactiveSpan({ name: '/404' })?.end();
    });

    expect(transportSend).not.toHaveBeenCalled();
    expect(debugLogSpy).toHaveBeenCalledWith('An event processor returned `null`, will not send event.');
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/react`'s `init` after modifying them
    type ModifiedInitOptionsIntegrationArray = { defaultIntegrations: Integration[]; integrations: Integration[] };

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [breadcrumbsIntegration({ console: false })] });

      const reactInitOptions = reactInit.mock.calls[0]![0] as ModifiedInitOptionsIntegrationArray;
      const installedBreadcrumbsIntegration = findIntegrationByName(reactInitOptions.integrations, 'Breadcrumbs');

      expect(installedBreadcrumbsIntegration).toBeDefined();
    });

    it('forces correct router instrumentation if user provides `browserTracingIntegration` in an array', () => {
      const providedBrowserTracingInstance = browserTracingIntegration();

      const client = init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        integrations: [providedBrowserTracingInstance],
      });

      const integration = client?.getIntegrationByName('BrowserTracing');
      expect(integration).toBe(providedBrowserTracingInstance);
    });

    it('forces correct router instrumentation if user provides `BrowserTracing` in a function', () => {
      const providedBrowserTracingInstance = browserTracingIntegration();

      const client = init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        integrations: defaults => [...defaults, providedBrowserTracingInstance],
      });

      const integration = client?.getIntegrationByName('BrowserTracing');

      expect(integration).toBe(providedBrowserTracingInstance);
    });

    describe('browserTracingIntegration()', () => {
      it('adds the browserTracingIntegration when `__SENTRY_TRACING__` is not set', () => {
        const client = init({
          dsn: TEST_DSN,
        });

        const browserTracingIntegration = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracingIntegration).toBeDefined();
      });

      it("doesn't add a browserTracingIntegration if `__SENTRY_TRACING__` is set to false", () => {
        // @ts-expect-error Test setup for build-time flag
        globalThis.__SENTRY_TRACING__ = false;

        const client = init({
          dsn: TEST_DSN,
        });

        const browserTracingIntegration = client?.getIntegrationByName('BrowserTracing');
        expect(browserTracingIntegration).toBeUndefined();

        // @ts-expect-error Test setup for build-time flag
        delete globalThis.__SENTRY_TRACING__;
      });
    });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
