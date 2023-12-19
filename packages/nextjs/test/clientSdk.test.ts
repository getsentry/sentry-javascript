import { BaseClient, getCurrentHub } from '@sentry/core';
import * as SentryReact from '@sentry/react';
import { BrowserTracing, WINDOW } from '@sentry/react';
import type { Integration } from '@sentry/types';
import type { UserIntegrationsFunction } from '@sentry/utils';
import { logger } from '@sentry/utils';
import { JSDOM } from 'jsdom';

import { Integrations, init, nextRouterInstrumentation } from '../src/client';

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

describe('Client init()', () => {
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
        integrations: expect.arrayContaining([
          expect.objectContaining({
            name: 'RewriteFrames',
          }),
        ]),
      }),
    );
  });

  it('sets runtime on scope', () => {
    const currentScope = getCurrentHub().getScope();

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
    const hub = getCurrentHub();
    const transportSend = jest.spyOn(hub.getClient()!.getTransport()!, 'send');

    const transaction = hub.startTransaction({ name: '/404' });
    transaction.finish();

    expect(transportSend).not.toHaveBeenCalled();
    expect(captureEvent.mock.results[0].value).toBeUndefined();
    expect(loggerLogSpy).toHaveBeenCalledWith('An event processor returned `null`, will not send event.');
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/react`'s `init` after modifying them
    type ModifiedInitOptionsIntegrationArray = { integrations: Integration[] };
    type ModifiedInitOptionsIntegrationFunction = { integrations: UserIntegrationsFunction };

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [new Integrations.Breadcrumbs({ console: false })] });

      const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
      const breadcrumbsIntegration = findIntegrationByName(reactInitOptions.integrations, 'Breadcrumbs');

      expect(breadcrumbsIntegration).toBeDefined();
    });

    describe('`BrowserTracing` integration', () => {
      it('adds `BrowserTracing` integration if `tracesSampleRate` is set', () => {
        init({ tracesSampleRate: 1.0 });

        const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
        const browserTracingIntegration = findIntegrationByName(reactInitOptions.integrations, 'BrowserTracing');

        expect(browserTracingIntegration).toBeDefined();
        expect(browserTracingIntegration).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              routingInstrumentation: nextRouterInstrumentation,
            }),
          }),
        );
      });

      it('adds `BrowserTracing` integration if `tracesSampler` is set', () => {
        init({ tracesSampler: () => true });

        const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
        const browserTracingIntegration = findIntegrationByName(reactInitOptions.integrations, 'BrowserTracing');

        expect(browserTracingIntegration).toBeDefined();
        expect(browserTracingIntegration).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              routingInstrumentation: nextRouterInstrumentation,
            }),
          }),
        );
      });

      it('does not add `BrowserTracing` integration if tracing not enabled in SDK', () => {
        init({});

        const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
        const browserTracingIntegration = findIntegrationByName(reactInitOptions.integrations, 'BrowserTracing');

        expect(browserTracingIntegration).toBeUndefined();
      });

      it('forces correct router instrumentation if user provides `BrowserTracing` in an array', () => {
        init({
          tracesSampleRate: 1.0,
          integrations: [new BrowserTracing({ startTransactionOnLocationChange: false })],
        });

        const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationArray;
        const browserTracingIntegration = findIntegrationByName(reactInitOptions.integrations, 'BrowserTracing');

        expect(browserTracingIntegration).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              routingInstrumentation: nextRouterInstrumentation,
              // This proves it's still the user's copy
              startTransactionOnLocationChange: false,
            }),
          }),
        );
      });

      it('forces correct router instrumentation if user provides `BrowserTracing` in a function', () => {
        init({
          tracesSampleRate: 1.0,
          integrations: defaults => [...defaults, new BrowserTracing({ startTransactionOnLocationChange: false })],
        });

        const reactInitOptions = reactInit.mock.calls[0][0] as ModifiedInitOptionsIntegrationFunction;
        const materializedIntegrations = reactInitOptions.integrations(SentryReact.defaultIntegrations);
        const browserTracingIntegration = findIntegrationByName(materializedIntegrations, 'BrowserTracing');

        expect(browserTracingIntegration).toEqual(
          expect.objectContaining({
            options: expect.objectContaining({
              routingInstrumentation: nextRouterInstrumentation,
              // This proves it's still the user's copy
              startTransactionOnLocationChange: false,
            }),
          }),
        );
      });
    });
  });
});
