import { BrowserClient } from '@sentry/browser';
import { Hub, makeMain, Scope } from '@sentry/hub';

import { Span, withSpan, withTransaction } from '../src';

describe('APM Helpers', () => {
  let hub: Hub;

  beforeEach(() => {
    jest.resetAllMocks();
    const myScope = new Scope();
    hub = new Hub(new BrowserClient({ tracesSampleRate: 1 }), myScope);
    makeMain(hub);
  });

  describe('helpers', () => {
    test('withTransaction', async () => {
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      let capturedTransaction: Span;
      await withTransaction('a', { op: 'op' }, async (transaction: Span) => {
        expect(transaction.op).toEqual('op');
        capturedTransaction = transaction;
      });
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].spans).toHaveLength(0);
      expect(spy.mock.calls[0][0].contexts.trace).toEqual(capturedTransaction!.getTraceContext());
    });

    test('withTransaction + withSpan', async () => {
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      await withTransaction('a', { op: 'op' }, async (transaction: Span) => {
        await transaction.withChild({
          op: 'sub',
        });
      });
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].spans).toHaveLength(1);
      expect(spy.mock.calls[0][0].spans[0].op).toEqual('sub');
    });

    test('withSpan', async () => {
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;

      // Setting transaction on the scope
      const transaction = hub.startSpan({
        transaction: 'transaction',
      });
      hub.configureScope((scope: Scope) => {
        scope.setSpan(transaction);
      });

      let capturedSpan: Span;
      await withSpan({ op: 'op' }, async (span: Span) => {
        expect(span.op).toEqual('op');
        capturedSpan = span;
      });
      expect(spy).not.toHaveBeenCalled();
      expect(capturedSpan!.op).toEqual('op');
    });

    test('withTransaction + withSpan + timing', async () => {
      jest.useRealTimers();
      const spy = jest.spyOn(hub as any, 'captureEvent') as any;
      await withTransaction('a', { op: 'op' }, async (transaction: Span) => {
        await transaction.withChild(
          {
            op: 'sub',
          },
          async () => {
            const ret = new Promise<void>((resolve: any) => {
              setTimeout(() => {
                resolve();
              }, 1100);
            });
            return ret;
          },
        );
      });
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[0][0].spans).toHaveLength(1);
      expect(spy.mock.calls[0][0].spans[0].op).toEqual('sub');
      const duration = spy.mock.calls[0][0].spans[0].timestamp - spy.mock.calls[0][0].spans[0].startTimestamp;
      expect(duration).toBeGreaterThanOrEqual(1);
    });
  });
});
