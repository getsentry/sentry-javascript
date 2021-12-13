import { BaseClient } from '@sentry/core';
import { getCurrentHub } from '@sentry/hub';
import * as SentryReact from '@sentry/react';
import { Integrations as TracingIntegrations } from '@sentry/tracing';
import { Integration } from '@sentry/types';
import { getGlobalObject, logger, SentryError } from '@sentry/utils';

import { init, Integrations, nextRouterInstrumentation } from '../src/index.client';
import { NextjsOptions } from '../src/utils/nextjsOptions';

const { BrowserTracing } = TracingIntegrations;

const global = getGlobalObject();

const reactInit = jest.spyOn(SentryReact, 'init');
const captureEvent = jest.spyOn(BaseClient.prototype, 'captureEvent');
const logError = jest.spyOn(logger, 'error');

describe('Client init()', () => {
  afterEach(() => {
    jest.clearAllMocks();
    global.__SENTRY__.hub = undefined;
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
        integrations: undefined,
      }),
    );
  });

  it('sets runtime on scope', () => {
    const currentScope = getCurrentHub().getScope();

    // @ts-ignore need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-ignore need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'browser' });
  });

  it('adds 404 transaction filter', () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const hub = getCurrentHub();
    const sendEvent = jest.spyOn(hub.getClient()!.getTransport!(), 'sendEvent');

    const transaction = hub.startTransaction({ name: '/404' });
    transaction.finish();

    expect(sendEvent).not.toHaveBeenCalled();
    expect(captureEvent.mock.results[0].value).toBeUndefined();
    expect(logError).toHaveBeenCalledWith(new SentryError('An event processor returned null, will not send event.'));
  });

  describe('integrations', () => {
    it('does not add BrowserTracing integration by default if tracesSampleRate is not set', () => {
      init({});

      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toBeUndefined();
    });

    it('adds BrowserTracing integration by default if tracesSampleRate is set', () => {
      init({ tracesSampleRate: 1.0 });

      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(BrowserTracing));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options.routingInstrumentation).toEqual(
        nextRouterInstrumentation,
      );
    });

    it('adds BrowserTracing integration by default if tracesSampler is set', () => {
      init({ tracesSampler: () => true });

      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(BrowserTracing));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options.routingInstrumentation).toEqual(
        nextRouterInstrumentation,
      );
    });

    it('supports passing integration through options', () => {
      init({ tracesSampleRate: 1.0, integrations: [new Integrations.Breadcrumbs({ console: false })] });
      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(2);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations).toEqual([expect.any(Integrations.Breadcrumbs), expect.any(BrowserTracing)]);
    });

    it('uses custom BrowserTracing with array option with nextRouterInstrumentation', () => {
      init({
        tracesSampleRate: 1.0,
        integrations: [new BrowserTracing({ idleTimeout: 5000, startTransactionOnLocationChange: false })],
      });

      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);
      const integrations = reactInitOptions.integrations as Integration[];
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options).toEqual(
        expect.objectContaining({
          idleTimeout: 5000,
          startTransactionOnLocationChange: false,
          routingInstrumentation: nextRouterInstrumentation,
        }),
      );
    });

    it('uses custom BrowserTracing with function option with nextRouterInstrumentation', () => {
      init({
        tracesSampleRate: 1.0,
        integrations: () => [new BrowserTracing({ idleTimeout: 5000, startTransactionOnLocationChange: false })],
      });

      const reactInitOptions: NextjsOptions = reactInit.mock.calls[0][0];
      const integrationFunc = reactInitOptions.integrations as () => Integration[];
      const integrations = integrationFunc();
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options).toEqual(
        expect.objectContaining({
          idleTimeout: 5000,
          startTransactionOnLocationChange: false,
          routingInstrumentation: nextRouterInstrumentation,
        }),
      );
    });
  });
});
