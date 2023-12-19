import { Hub } from '@sentry/core';
import type { NodeClient } from '../src/client';

import { OnUnhandledRejection, makeUnhandledPromiseHandler } from '../src/integrations/onunhandledrejection';

// don't log the test errors we're going to throw, so at a quick glance it doesn't look like the test itself has failed
global.console.warn = () => null;
global.console.error = () => null;

const client = { getOptions: () => ({}) } as unknown as NodeClient;

jest.mock('@sentry/core', () => {
  // we just want to short-circuit it, so dont worry about types
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getClient: () => client,
  };
});

describe('unhandled promises', () => {
  test('install global listener', () => {
    const integration = new OnUnhandledRejection();
    integration.setup(client);
    expect(process.listeners('unhandledRejection')).toHaveLength(1);
  });

  test('makeUnhandledPromiseHandler', () => {
    const promise = {
      domain: {
        sentryContext: {
          extra: { extra: '1' },
          tags: { tag: '2' },
          user: { id: 1 },
        },
      },
    };

    const captureException = jest.spyOn(Hub.prototype, 'captureException');

    const handler = makeUnhandledPromiseHandler(client, {
      mode: 'warn',
    });

    handler('bla', promise);

    expect(captureException.mock.calls[0][1]).toEqual({
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
