import { Scope } from '@sentry/core';
import { Hub } from '@sentry/hub';

import { OnUnhandledRejection } from '../src/integrations/onunhandledrejection';

jest.mock('@sentry/hub', () => {
  // we just want to short-circuit it, so dont worry about types
  const original = jest.requireActual('@sentry/hub');
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
    const setUser = jest.spyOn(Scope.prototype, 'setUser');
    const setExtra = jest.spyOn(Scope.prototype, 'setExtra');
    const setExtras = jest.spyOn(Scope.prototype, 'setExtras');
    const setTags = jest.spyOn(Scope.prototype, 'setTags');

    integration.sendUnhandledPromise('bla', promise);

    expect(captureException.mock.calls[0][1]?.data).toEqual({
      mechanism: { handled: false, type: 'onunhandledrejection' },
    });
    expect(captureException.mock.calls[0][0]).toBe('bla');
    expect(setUser.mock.calls[0][0]).toEqual({ id: 1 });
    expect(setExtra.mock.calls[0]).toEqual(['unhandledPromiseRejection', true]);

    expect(setExtras.mock.calls[0]).toEqual([{ extra: '1' }]);
    expect(setTags.mock.calls[0]).toEqual([{ tag: '2' }]);
  });
});
