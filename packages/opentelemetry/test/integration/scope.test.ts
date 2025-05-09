import {
  captureException,
  getCapturedScopesOnSpan,
  getClient,
  getCurrentScope,
  getIsolationScope,
  setTag,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startSpan } from '../../src/trace';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClientInterface } from '../helpers/TestClient';

describe('Integration | Scope', () => {
  afterEach(async () => {
    await cleanupOtel();
  });

  describe.each([
    ['with tracing', true],
    ['without tracing', false],
  ])('%s', (_name, tracingEnabled) => {
    it('correctly syncs OTEL context & Sentry hub/scope', async () => {
      const beforeSend = vi.fn(() => null);
      const beforeSendTransaction = vi.fn(() => null);

      mockSdkInit({
        tracesSampleRate: tracingEnabled ? 1 : 0,
        beforeSend,
        beforeSendTransaction,
      });

      const client = getClient() as TestClientInterface;

      const rootScope = getCurrentScope();

      const error = new Error('test error');
      let spanId: string | undefined;
      let traceId: string | undefined;

      rootScope.setTag('tag1', 'val1');

      withScope(scope1 => {
        scope1.setTag('tag2', 'val2');

        withScope(scope2b => {
          scope2b.setTag('tag3-b', 'val3-b');
        });

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3');

          startSpan({ name: 'outer' }, span => {
            expect(getCapturedScopesOnSpan(span).scope).toBe(tracingEnabled ? scope2 : undefined);

            spanId = span.spanContext().spanId;
            traceId = span.spanContext().traceId;

            setTag('tag4', 'val4');

            captureException(error);
          });
        });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);

      if (spanId) {
        expect(beforeSend).toHaveBeenCalledWith(
          expect.objectContaining({
            contexts: {
              trace: {
                span_id: spanId,
                trace_id: traceId,
              },
            },
          }),
          {
            event_id: expect.any(String),
            originalException: error,
            syntheticException: expect.any(Error),
          },
        );
      }

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: {
            tag1: 'val1',
            tag2: 'val2',
            tag3: 'val3',
            tag4: 'val4',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error,
          syntheticException: expect.any(Error),
        },
      );

      if (tracingEnabled) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
        // Note: Scope for transaction is taken at `start` time, not `finish` time
        expect(beforeSendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            contexts: expect.objectContaining({
              trace: {
                data: {
                  'sentry.origin': 'manual',
                  'sentry.source': 'custom',
                  'sentry.sample_rate': 1,
                },
                span_id: spanId,
                status: 'ok',
                trace_id: traceId,
                origin: 'manual',
              },
            }),
            spans: [],
            start_timestamp: expect.any(Number),
            tags: {
              tag1: 'val1',
              tag2: 'val2',
              tag3: 'val3',
              tag4: 'val4',
            },
            timestamp: expect.any(Number),
            transaction_info: { source: 'custom' },
            type: 'transaction',
          }),
          {
            event_id: expect.any(String),
          },
        );
      }
    });

    it('isolates parallel scopes', async () => {
      const beforeSend = vi.fn(() => null);
      const beforeSendTransaction = vi.fn(() => null);

      mockSdkInit({ tracesSampleRate: tracingEnabled ? 1 : 0, beforeSend, beforeSendTransaction });

      const client = getClient() as TestClientInterface;
      const rootScope = getCurrentScope();

      const error1 = new Error('test error 1');
      const error2 = new Error('test error 2');
      let spanId1: string | undefined;
      let spanId2: string | undefined;
      let traceId1: string | undefined;
      let traceId2: string | undefined;

      rootScope.setTag('tag1', 'val1');

      const initialIsolationScope = getIsolationScope();

      withScope(scope1 => {
        scope1.setTag('tag2', 'val2a');

        expect(getIsolationScope()).toBe(initialIsolationScope);

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3a');

          startSpan({ name: 'outer' }, span => {
            expect(getIsolationScope()).toBe(initialIsolationScope);

            spanId1 = span.spanContext().spanId;
            traceId1 = span.spanContext().traceId;

            setTag('tag4', 'val4a');

            captureException(error1);
          });
        });
      });

      withScope(scope1 => {
        scope1.setTag('tag2', 'val2b');

        expect(getIsolationScope()).toBe(initialIsolationScope);

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3b');

          startSpan({ name: 'outer' }, span => {
            expect(getIsolationScope()).toBe(initialIsolationScope);

            spanId2 = span.spanContext().spanId;
            traceId2 = span.spanContext().traceId;

            setTag('tag4', 'val4b');

            captureException(error2);
          });
        });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(2);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: spanId1
              ? {
                  span_id: spanId1,
                  trace_id: traceId1,
                }
              : expect.any(Object),
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2a',
            tag3: 'val3a',
            tag4: 'val4a',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error1,
          syntheticException: expect.any(Error),
        },
      );

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: spanId2
              ? {
                  span_id: spanId2,
                  trace_id: traceId2,
                }
              : expect.any(Object),
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2b',
            tag3: 'val3b',
            tag4: 'val4b',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error2,
          syntheticException: expect.any(Error),
        },
      );

      if (tracingEnabled) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(2);
      }
    });

    it('isolates parallel isolation scopes', async () => {
      const beforeSend = vi.fn(() => null);
      const beforeSendTransaction = vi.fn(() => null);

      mockSdkInit({ tracesSampleRate: tracingEnabled ? 1 : 0, beforeSend, beforeSendTransaction });

      const client = getClient() as TestClientInterface;
      const rootScope = getCurrentScope();

      const error1 = new Error('test error 1');
      const error2 = new Error('test error 2');
      let spanId1: string | undefined;
      let spanId2: string | undefined;
      let traceId1: string | undefined;
      let traceId2: string | undefined;

      rootScope.setTag('tag1', 'val1');

      const initialIsolationScope = getIsolationScope();
      initialIsolationScope.setTag('isolationTag1', 'val1');

      withIsolationScope(scope1 => {
        scope1.setTag('tag2', 'val2a');

        expect(getIsolationScope()).not.toBe(initialIsolationScope);
        getIsolationScope().setTag('isolationTag2', 'val2');

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3a');

          startSpan({ name: 'outer' }, span => {
            expect(getIsolationScope()).not.toBe(initialIsolationScope);

            spanId1 = span.spanContext().spanId;
            traceId1 = span.spanContext().traceId;

            setTag('tag4', 'val4a');

            captureException(error1);
          });
        });
      });

      withIsolationScope(scope1 => {
        scope1.setTag('tag2', 'val2b');

        expect(getIsolationScope()).not.toBe(initialIsolationScope);
        getIsolationScope().setTag('isolationTag2', 'val2b');

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3b');

          startSpan({ name: 'outer' }, span => {
            expect(getIsolationScope()).not.toBe(initialIsolationScope);

            spanId2 = span.spanContext().spanId;
            traceId2 = span.spanContext().traceId;

            setTag('tag4', 'val4b');

            captureException(error2);
          });
        });
      });

      await client.flush();

      expect(spanId1).toBeDefined();
      expect(spanId2).toBeDefined();
      expect(traceId1).toBeDefined();
      expect(traceId2).toBeDefined();

      expect(beforeSend).toHaveBeenCalledTimes(2);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: {
              span_id: spanId1,
              trace_id: traceId1,
            },
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2a',
            tag3: 'val3a',
            tag4: 'val4a',
            isolationTag1: 'val1',
            isolationTag2: 'val2',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error1,
          syntheticException: expect.any(Error),
        },
      );

      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: {
              span_id: spanId2,
              trace_id: traceId2,
            },
          }),
          tags: {
            tag1: 'val1',
            tag2: 'val2b',
            tag3: 'val3b',
            tag4: 'val4b',
            isolationTag1: 'val1',
            isolationTag2: 'val2b',
          },
        }),
        {
          event_id: expect.any(String),
          originalException: error2,
          syntheticException: expect.any(Error),
        },
      );

      if (tracingEnabled) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(2);
      }
    });
  });
});
