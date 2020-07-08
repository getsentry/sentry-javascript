import { BrowserClient } from '@sentry/browser';
import { Hub } from '@sentry/hub';

import { addExtensionMethods } from '../src/hubextensions';

addExtensionMethods();

describe('Hub', () => {
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

  describe('spans', () => {
    describe('sampling', () => {
      test('set tracesSampleRate 0 on transaction', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const transaction = hub.startTransaction({ name: 'foo' });
        expect(transaction.sampled).toBe(false);
      });
      test('set tracesSampleRate 1 on transaction', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
        const transaction = hub.startTransaction({ name: 'foo' });
        expect(transaction.sampled).toBeTruthy();
      });
      test('set tracesSampleRate should be propergated to children', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const transaction = hub.startTransaction({ name: 'foo' });
        const child = transaction.startChild({ op: 'test' });
        expect(child.sampled).toBeFalsy();
      });
    });
  });
});
