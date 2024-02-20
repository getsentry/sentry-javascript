import * as SentryCore from '@sentry/core';
import type { Client } from '@sentry/types';

import { makeUnhandledPromiseHandler, onUnhandledRejectionIntegration } from '../src/integrations/onunhandledrejection';

// don't log the test errors we're going to throw, so at a quick glance it doesn't look like the test itself has failed
global.console.warn = () => null;
global.console.error = () => null;

describe('unhandled promises', () => {
  test('install global listener', () => {
    const client = { getOptions: () => ({}) } as unknown as Client;
    SentryCore.setCurrentClient(client);

    const integration = onUnhandledRejectionIntegration();
    integration.setup!(client);
    expect(process.listeners('unhandledRejection')).toHaveLength(1);
  });

  test('makeUnhandledPromiseHandler', () => {
    const client = { getOptions: () => ({}) } as unknown as Client;
    SentryCore.setCurrentClient(client);

    const promise = {
      domain: {
        sentryContext: {
          extra: { extra: '1' },
          tags: { tag: '2' },
          user: { id: 1 },
        },
      },
    };

    const captureException = jest.spyOn(SentryCore, 'captureException').mockImplementation(() => 'test');

    const handler = makeUnhandledPromiseHandler(client, {
      mode: 'warn',
    });

    handler('bla', promise);

    expect(captureException).toHaveBeenCalledWith('bla', {
      originalException: {
        domain: {
          sentryContext: {
            extra: {
              extra: '1',
            },
            tags: {
              tag: '2',
            },
            user: {
              id: 1,
            },
          },
        },
      },
      captureContext: {
        extra: {
          unhandledPromiseRejection: true,
        },
      },
      mechanism: {
        handled: false,
        type: 'onunhandledrejection',
      },
    });
    expect(captureException.mock.calls[0][0]).toBe('bla');
  });
});
