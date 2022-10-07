import { Hub } from '@sentry/core';

import { OnUnhandledRejection } from '../src/integrations/onunhandledrejection';

// don't log the test errors we're going to throw, so at a quick glance it doesn't look like the test itself has failed
global.console.warn = () => null;
global.console.error = () => null;

jest.mock('@sentry/core', () => {
  // we just want to short-circuit it, so dont worry about types
  const original = jest.requireActual('@sentry/core');
  original.Hub.prototype.getIntegration = () => true;
  return {
    ...original,
    getCurrentHub: () => new Hub(),
  };
});

describe('unhandled promises', () => {
  test('install global listener', () => {
    const integration = new OnUnhandledRejection();
    integration.setupOnce();
    expect(process.listeners('unhandledRejection')).toHaveLength(1);
  });

  test('sendUnhandledPromise', () => {
    const integration = new OnUnhandledRejection();
    integration.setupOnce();

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

    integration.sendUnhandledPromise('bla', promise);

    expect(captureException.mock.calls[0][1]?.data).toEqual({
      mechanism: { handled: false, type: 'onunhandledrejection' },
    });
    expect(captureException.mock.calls[0][0]).toBe('bla');
  });
});
