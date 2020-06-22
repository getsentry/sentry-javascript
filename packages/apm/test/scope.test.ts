import { BrowserClient } from '@sentry/browser';
import { Hub } from '@sentry/hub';

import { addExtensionMethods } from '../src/hubextensions';

addExtensionMethods();

describe('Scope', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('getTransaction', () => {
    test('simple invoke', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
      const transaction = hub.startTransaction({ name: 'foo' });
      hub.configureScope(scope => {
        scope.setSpan(transaction);
      });
      hub.configureScope(s => {
        expect(s.getTransaction()).toBe(transaction);
      });
    });

    test('not invoke', () => {
      const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
      const transaction = hub.startTransaction({ name: 'foo' });
      hub.configureScope(s => {
        expect(s.getTransaction()).toBeUndefined();
      });
      transaction.finish();
    });
  });
});
