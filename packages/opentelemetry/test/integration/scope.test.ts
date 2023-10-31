import { captureException, setTag } from '@sentry/core';

import { getCurrentHub, OpenTelemetryHub } from '../../src/custom/hub';
import { OpenTelemetryScope } from '../../src/custom/scope';
import { startSpan } from '../../src/trace';
import { getCurrentRootScope, getCurrentScope, getGlobalScope, withRootScope, withScope } from '../../src/utils/scope';
import { getSpanScope } from '../../src/utils/spanData';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClientInterface } from '../helpers/TestClient';

describe('Integration | Scope', () => {
  afterEach(() => {
    cleanupOtel();
  });

  test('withScope() & getCurrentScope() works', () => {
    mockSdkInit({});

    const globalScope = getCurrentScope() as OpenTelemetryScope;
    expect(globalScope).toBeDefined();

    globalScope.setTag('tag1', 'val1');

    withScope(scope1 => {
      expect(scope1).toBeDefined();
      expect(scope1).not.toBe(globalScope);
      expect(getCurrentScope()).toBe(scope1);

      scope1.setTag('tag2', 'val2');

      withScope(scope2 => {
        expect(scope2).toBeDefined();

        expect(scope2).not.toBe(scope1);
        expect(getCurrentScope()).toBe(scope2);

        scope2.setTag('tag3', 'val3');

        expect((scope2 as OpenTelemetryScope)['_tags']).toEqual({ tag1: 'val1', tag2: 'val2', tag3: 'val3' });
      });

      expect((scope1 as OpenTelemetryScope)['_tags']).toEqual({ tag1: 'val1', tag2: 'val2' });
    });

    globalScope.setTag('tag99', 'val99');

    expect(getCurrentScope()).toBe(globalScope);
    expect(globalScope['_tags']).toEqual({ tag1: 'val1', tag99: 'val99' });
  });

  test('withRootScope() & getCurrentRootScope() works', async () => {
    mockSdkInit({});

    const globalScope = getCurrentScope();
    expect(globalScope).toBeDefined();

    withScope(scope1 => {
      expect(scope1).toBeDefined();
      expect(getCurrentRootScope()).toBe(scope1);

      withScope(scope2 => {
        expect(scope2).toBeDefined();
        expect(getCurrentRootScope()).toBe(scope1);

        withRootScope(rootScope2 => {
          expect(rootScope2).toBeDefined();
          expect(getCurrentRootScope()).toBe(rootScope2);
        });
      });
    });

    expect(getCurrentRootScope()).toBe(globalScope);
  });

  test('root scope is automatically set for root spans', async () => {
    mockSdkInit({ enableTracing: true });

    const globalScope = getCurrentScope();
    expect(globalScope).toBeDefined();

    withScope(scope1 => {
      expect(scope1).toBeDefined();
      expect(getCurrentRootScope()).toBe(scope1);

      startSpan({ name: 'root span' }, () => {
        const scope2 = getCurrentScope();
        expect(scope2).not.toBe(scope1);
        expect(getCurrentRootScope()).toBe(scope2);

        startSpan({ name: 'span' }, () => {
          const scope3 = getCurrentScope();
          expect(scope3).not.toBe(scope2);
          expect(getCurrentRootScope()).toBe(scope2);
        });
      });
    });

    expect(getCurrentRootScope()).toBe(globalScope);
  });

  test('getGlobalScope() works', () => {
    mockSdkInit({});

    const globalScope = getCurrentScope() as OpenTelemetryScope;
    expect(globalScope).toBeDefined();

    expect(getGlobalScope()).toBe(globalScope);

    withScope(() => {
      expect(getGlobalScope()).toBe(globalScope);

      withScope(() => {
        expect(getGlobalScope()).toBe(globalScope);

        withRootScope(() => {
          expect(getGlobalScope()).toBe(globalScope);
        });
      });
    });

    expect(getGlobalScope()).toBe(globalScope);
  });

  describe.each([
    ['with tracing', true],
    ['without tracing', false],
  ])('%s', (_name, enableTracing) => {
    it('correctly syncs OTEL context & Sentry hub/scope', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeSendTransaction = jest.fn(() => null);

      mockSdkInit({ enableTracing, beforeSend, beforeSendTransaction });

      const hub = getCurrentHub();
      const client = hub.getClient() as TestClientInterface;

      const rootScope = hub.getScope();

      expect(hub).toBeInstanceOf(OpenTelemetryHub);
      expect(rootScope).toBeInstanceOf(OpenTelemetryScope);

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
            expect(getSpanScope(span)).toBe(enableTracing ? scope2 : undefined);

            spanId = span.spanContext().spanId;
            traceId = span.spanContext().traceId;

            setTag('tag4', 'val4');

            captureException(error);
          });
        });
      });

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
      expect(beforeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: spanId
              ? {
                  span_id: spanId,
                  trace_id: traceId,
                  parent_span_id: undefined,
                }
              : expect.any(Object),
          }),
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

      if (enableTracing) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
        // Note: Scope for transaction is taken at `start` time, not `finish` time
        expect(beforeSendTransaction).toHaveBeenCalledWith(
          expect.objectContaining({
            contexts: expect.objectContaining({
              trace: {
                data: { 'otel.kind': 'INTERNAL' },
                span_id: spanId,
                status: 'ok',
                trace_id: traceId,
              },
            }),

            spans: [],
            start_timestamp: expect.any(Number),
            tags: {
              tag1: 'val1',
              tag2: 'val2',
              tag3: 'val3',
            },
            timestamp: expect.any(Number),
            transaction: 'outer',
            transaction_info: { source: 'custom' },
            type: 'transaction',
          }),
          {
            event_id: expect.any(String),
          },
        );
      }
    });

    it('isolates parallel root scopes', async () => {
      const beforeSend = jest.fn(() => null);
      const beforeSendTransaction = jest.fn(() => null);

      mockSdkInit({ enableTracing, beforeSend, beforeSendTransaction });

      const hub = getCurrentHub();
      const client = hub.getClient() as TestClientInterface;

      const rootScope = hub.getScope();

      expect(hub).toBeInstanceOf(OpenTelemetryHub);
      expect(rootScope).toBeInstanceOf(OpenTelemetryScope);

      const error1 = new Error('test error 1');
      const error2 = new Error('test error 2');
      let spanId1: string | undefined;
      let spanId2: string | undefined;
      let traceId1: string | undefined;
      let traceId2: string | undefined;

      rootScope.setTag('tag1', 'val1');

      withScope(scope1 => {
        scope1.setTag('tag2', 'val2a');

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3a');

          startSpan({ name: 'outer' }, span => {
            spanId1 = span.spanContext().spanId;
            traceId1 = span.spanContext().traceId;

            setTag('tag4', 'val4a');

            captureException(error1);
          });
        });
      });

      withScope(scope1 => {
        scope1.setTag('tag2', 'val2b');

        withScope(scope2 => {
          scope2.setTag('tag3', 'val3b');

          startSpan({ name: 'outer' }, span => {
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
                  parent_span_id: undefined,
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
                  parent_span_id: undefined,
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

      if (enableTracing) {
        expect(beforeSendTransaction).toHaveBeenCalledTimes(2);
      }
    });
  });
});
