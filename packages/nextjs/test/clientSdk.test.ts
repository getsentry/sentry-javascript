import {
  BaseClient,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  getActiveSpan,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import * as SentryReact from '@sentry/react';
import type { BrowserClient } from '@sentry/react';
import { browserTracingIntegration } from '@sentry/react';
import { WINDOW, getClient, getCurrentScope } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import { BrowserTracing, breadcrumbsIntegration, init, nextRouterInstrumentation } from '../src/client';

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
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    WINDOW.__SENTRY__.hub = undefined;
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
            name: 'RewriteFrames',
          }),
        ]),
      }),
    );
  });

  it('sets runtime on scope', () => {
    const currentScope = getCurrentScope();

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'browser' });
  });

  it('adds 404 transaction filter', () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const transportSend = jest.spyOn(getClient()!.getTransport()!, 'send');

    // Ensure we have no current span, so our next span is a transaction
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope().setSpan(undefined);

    SentryReact.startSpan({ name: '/404' }, () => {
      // noop
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

    it('forces correct router instrumentation if user provides `BrowserTracing` in an array', () => {
      init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        // eslint-disable-next-line deprecation/deprecation
        integrations: [new BrowserTracing({ finalTimeout: 10 })],
      });

      const client = getClient<BrowserClient>()!;
      // eslint-disable-next-line deprecation/deprecation
      const browserTracingIntegration = client.getIntegrationByName<BrowserTracing>('BrowserTracing');

      expect(browserTracingIntegration).toBeDefined();
      expect(browserTracingIntegration?.options).toEqual(
        expect.objectContaining({
          // eslint-disable-next-line deprecation/deprecation
          routingInstrumentation: nextRouterInstrumentation,
          // This proves it's still the user's copy
          finalTimeout: 10,
        }),
      );
    });

    it('forces correct router instrumentation if user provides `browserTracingIntegration`', () => {
      const beforeStartSpan = jest.fn(options => options);
      init({
        dsn: TEST_DSN,
        integrations: [
          browserTracingIntegration({
            finalTimeout: 10,
            instrumentNavigation: false,
            beforeStartSpan,
          }),
        ],
        enableTracing: true,
      });

      const client = getClient<BrowserClient>()!;
      // eslint-disable-next-line deprecation/deprecation
      const integration = client.getIntegrationByName<ReturnType<typeof browserTracingIntegration>>('BrowserTracing');

      expect(integration).toBeDefined();

      // It is a "new" browser tracing integration
      expect(typeof integration?.afterAllSetup).toBe('function');

      // This shows that the user-configured options are still here
      expect(integration?.options?.finalTimeout).toEqual(10);
      expect(integration?.options.instrumentNavigation).toBe(false);
      expect(integration?.options.instrumentPageLoad).toBe(true);

      expect(beforeStartSpan).toHaveBeenCalledTimes(1);
      expect(beforeStartSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '/',
          op: 'pageload',
        }),
      );

      // it is the svelte kit variety
      expect(getActiveSpan()).toBeDefined();
      expect(spanToJSON(getActiveSpan()!).data?.[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]).toEqual(
        'auto.pageload.nextjs.app_router_instrumentation',
      );
    });

    it('forces correct router instrumentation if user provides `BrowserTracing` in a function', () => {
      init({
        dsn: TEST_DSN,
        tracesSampleRate: 1.0,
        // eslint-disable-next-line deprecation/deprecation
        integrations: defaults => [...defaults, new BrowserTracing({ startTransactionOnLocationChange: false })],
      });

      const client = getClient<BrowserClient>()!;

      // eslint-disable-next-line deprecation/deprecation
      const browserTracingIntegration = client.getIntegrationByName<BrowserTracing>('BrowserTracing');

      expect(browserTracingIntegration).toBeDefined();

      // It is a "old" browser tracing integration
      // @ts-expect-error this does not exist
      expect(typeof browserTracingIntegration!['afterAllSetup']).toBe('undefined');

      expect(browserTracingIntegration?.options).toEqual(
        expect.objectContaining({
          startTransactionOnPageLoad: true,
          startTransactionOnLocationChange: false,
          // eslint-disable-next-line deprecation/deprecation
          routingInstrumentation: nextRouterInstrumentation,
        }),
      );
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
