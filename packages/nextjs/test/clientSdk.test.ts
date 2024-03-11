import { BaseClient, getGlobalScope, getIsolationScope } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import type { BrowserClient } from '@sentry/react';
import { WINDOW, getClient, getCurrentScope } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import { breadcrumbsIntegration, browserTracingIntegration, init } from '../src/client';

const reactInit = jest.spyOn(SentryReact, 'init');
const captureEvent = jest.spyOn(BaseClient.prototype, 'captureEvent');
const loggerLogSpy = jest.spyOn(logger, 'log');

// We're setting up JSDom here because the Next.js routing instrumentations requires a few things to be present on pageload:
// 1. Access to window.document API for `window.document.getElementById`
// 2. Access to window.location API for `window.location.pathname`
const dom = new JSDOM(undefined, { url: 'https://example.com/' });
Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
Object.defineProperty(global, 'location', { value: dom.window.document.location, writable: true });

const originalGlobalDocument = WINDOW.document;
const originalGlobalLocation = WINDOW.location;
afterAll(() => {
  // Clean up JSDom
  Object.defineProperty(WINDOW, 'document', { value: originalGlobalDocument });
  Object.defineProperty(WINDOW, 'location', { value: originalGlobalLocation });
});

function findIntegrationByName(integrations: Integration[] = [], name: string): Integration | undefined {
  return integrations.find(integration => integration.name === name);
}

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

describe('Client init()', () => {
  afterEach(() => {
    jest.clearAllMocks();

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

  it('sets runtime on scope', () => {
    expect(SentryReact.getIsolationScope().getScopeData().tags).toEqual({});

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(SentryReact.getIsolationScope().getScopeData().tags).toEqual({ runtime: 'browser' });
  });

  it('adds 404 transaction filter', () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const transportSend = jest.spyOn(getClient()!.getTransport()!, 'send');

    // Ensure we have no current span, so our next span is a transaction
    SentryReact.withActiveSpan(null, () => {
      SentryReact.startInactiveSpan({ name: '/404' })?.end();
    });

    expect(transportSend).not.toHaveBeenCalled();
    expect(captureEvent.mock.results[0].value).toBeUndefined();
    expect(loggerLogSpy).toHaveBeenCalledWith('An event processor returned `null`, will not send event.');
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/react`'s `init` after modifying them
    type ModifiedInitOptionsIntegrationArray = { defaultIntegrations: Integration[]; integrations: Integration[] };

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [breadcrumbsIntegration({ console: false })] });

      const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
      const installedBreadcrumbsIntegration = findIntegrationByName(reactInitOptions.integrations, 'Breadcrumbs');

      expect(installedBreadcrumbsIntegration).toBeDefined();
    });

    it('forces correct router instrumentation if user provides `browserTracingIntegration` in an array', () => {
      const providedBrowserTracingInstance = browserTracingIntegration();

      init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        integrations: [providedBrowserTracingInstance],
      });

      const client = getClient<BrowserClient>()!;

      const integration = client.getIntegrationByName('BrowserTracing');
      expect(integration).toBe(providedBrowserTracingInstance);
    });

    it('forces correct router instrumentation if user provides `BrowserTracing` in a function', () => {
      const providedBrowserTracingInstance = browserTracingIntegration();

      init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        integrations: defaults => [...defaults, providedBrowserTracingInstance],
      });

      const client = getClient<BrowserClient>()!;

      const integration = client.getIntegrationByName('BrowserTracing');

      expect(integration).toBe(providedBrowserTracingInstance);
    });

    describe('browserTracingIntegration()', () => {
      it('adds `browserTracingIntegration()` integration if `tracesSampleRate` is set', () => {
        init({
          dsn: TEST_DSN,
          tracesSampleRate: 1.0,
        });

        const client = getClient<BrowserClient>()!;
        const browserTracingIntegration = client.getIntegrationByName('BrowserTracing');
        expect(browserTracingIntegration?.name).toBe('BrowserTracing');
      });

      it('adds `browserTracingIntegration()` integration if `tracesSampler` is set', () => {
        init({
          dsn: TEST_DSN,
          tracesSampler: () => true,
        });

        const client = getClient<BrowserClient>()!;
        const browserTracingIntegration = client.getIntegrationByName('BrowserTracing');
        expect(browserTracingIntegration?.name).toBe('BrowserTracing');
      });

      it('does not add `browserTracingIntegration()` integration if tracing not enabled in SDK', () => {
        init({
          dsn: TEST_DSN,
        });

        const client = getClient<BrowserClient>()!;

        const browserTracingIntegration = client.getIntegrationByName('BrowserTracing');
        expect(browserTracingIntegration).toBeUndefined();
      });
    });
  });
});
