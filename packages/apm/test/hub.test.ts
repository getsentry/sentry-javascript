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
      test('set tracesSampleRate 0 on span', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 0 }));
        const span = hub.startSpan({}) as any;
        expect(span.sampled).toBeUndefined();
      });
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

    describe('startSpan', () => {
      test('simple standalone Span', () => {
        const hub = new Hub(new BrowserClient());
        const span = hub.startSpan({}) as any;
        expect(span.spanId).toBeTruthy();
      });

      test('simple standalone Transaction', () => {
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }));
        const transaction = hub.startTransaction({ name: 'transaction' });
        expect(transaction.spanId).toBeTruthy();
        // tslint:disable-next-line: no-unbound-method
        expect(transaction.setName).toBeTruthy();
      });

      test('Transaction inherits trace_id from span on scope', () => {
        const myScope = new Scope();
        const hub = new Hub(new BrowserClient(), myScope);
        const parentSpan = hub.startSpan({}) as any;
        hub.configureScope(scope => {
          scope.setSpan(parentSpan);
        });
        // @ts-ignore
        const span = hub.startSpan({ name: 'test' }) as any;
        expect(span.trace_id).toEqual(parentSpan.trace_id);
      });

      test('create a child if there is a Span already on the scope', () => {
        const myScope = new Scope();
        const hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }), myScope);
        const transaction = hub.startTransaction({ name: 'transaction' });
        hub.configureScope(scope => {
          scope.setSpan(transaction);
        });
        const span = hub.startSpan({});
        expect(span.traceId).toEqual(transaction.traceId);
        expect(span.parentSpanId).toEqual(transaction.spanId);
        hub.configureScope(scope => {
          scope.setSpan(span);
        });
        const span2 = hub.startSpan({});
        expect(span2.traceId).toEqual(span.traceId);
        expect(span2.parentSpanId).toEqual(span.spanId);
      });
    });
  });
});
