import { BrowserClient } from '@sentry/browser';
import { Hub, Scope } from '@sentry/hub';

import { addExtensionMethods } from '../src/hubextensions';

addExtensionMethods();

describe('Hub', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('spans', () => {
    describe('sampling', () => {
      test('set tracesSampleRate 0', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const span = hub.startSpan() as any;
        expect(span.sampled).toBeUndefined();
      });
      test('set tracesSampleRate 0 on transaction', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const span = hub.startSpan({ transaction: 'foo' }) as any;
        expect(span.sampled).toBe(false);
      });
      test('set tracesSampleRate 1', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
        const span = hub.startSpan({ transaction: 'foo' }) as any;
        expect(span.sampled).toBeTruthy();
      });
    });
    describe('start', () => {
      test('simple', () => {
        const hub = new Hub(new BrowserClient());
        const span = hub.startSpan() as any;
        expect(span._spanId).toBeTruthy();
      });

      test('inherits from parent span', () => {
        const myScope = new Scope();
        const hub = new Hub(new BrowserClient(), myScope);
        const parentSpan = hub.startSpan({}) as any;
        expect(parentSpan._parentId).toBeFalsy();
        hub.configureScope(scope => {
          scope.setSpan(parentSpan);
        });
        const span = hub.startSpan({}) as any;
        expect(span._parentSpanId).toBeTruthy();
      });
    });
  });
});
