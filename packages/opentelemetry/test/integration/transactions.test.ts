import type { SpanContext } from '@opentelemetry/api';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { TraceFlags, context, trace } from '@opentelemetry/api';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  addBreadcrumb,
  getClient,
  setTag,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import type { Event, TransactionEvent } from '@sentry/types';
import { logger } from '@sentry/utils';

import { TraceState } from '@opentelemetry/core';
import { SENTRY_TRACE_STATE_DSC } from '../../src/constants';
import { makeTraceState } from '../../src/propagator';
import { startInactiveSpan, startSpan } from '../../src/trace';
import type { TestClientInterface } from '../helpers/TestClient';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | Transactions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    cleanupOtel();
  });

  it('correctly creates transaction & spans', async () => {
    const transactions: TransactionEvent[] = [];
    const beforeSendTransaction = jest.fn(event => {
      transactions.push(event);
      return null;
    });

    mockSdkInit({
      enableTracing: true,
      beforeSendTransaction,
      release: '8.0.0',
    });

    const client = getClient() as TestClientInterface;

    addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });
    setTag('outer.tag', 'test value');

    startSpan(
      {
        op: 'test op',
        name: 'test name',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
        },
      },
      span => {
        addBreadcrumb({ message: 'test breadcrumb 2', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value',
        });

        const subSpan = startInactiveSpan({ name: 'inner span 1' });
        subSpan.end();

        setTag('test.tag', 'test value');

        startSpan({ name: 'inner span 2' }, innerSpan => {
          addBreadcrumb({ message: 'test breadcrumb 3', timestamp: 123456 });

          innerSpan.setAttributes({
            'test.inner': 'test value',
          });
        });
      },
    );

    await client.flush();

    expect(transactions).toHaveLength(1);
    const transaction = transactions[0]!;

    expect(transaction.breadcrumbs).toEqual([
      { message: 'test breadcrumb 1', timestamp: 123456 },
      { message: 'test breadcrumb 2', timestamp: 123456 },
      { message: 'test breadcrumb 3', timestamp: 123456 },
    ]);

    expect(transaction.contexts?.otel).toEqual({
      resource: {
        'service.name': 'opentelemetry-test',
        'service.namespace': 'sentry',
        'service.version': expect.any(String),
        'telemetry.sdk.language': 'nodejs',
        'telemetry.sdk.name': 'opentelemetry',
        'telemetry.sdk.version': expect.any(String),
      },
    });

    expect(transaction.contexts?.trace).toEqual({
      data: {
        'otel.kind': 'INTERNAL',
        'sentry.op': 'test op',
        'sentry.origin': 'auto.test',
        'sentry.source': 'task',
        'sentry.sample_rate': 1,
        'test.outer': 'test value',
      },
      op: 'test op',
      span_id: expect.any(String),
      status: 'ok',
      trace_id: expect.any(String),
      origin: 'auto.test',
    });

    expect(transaction.sdkProcessingMetadata?.sampleRate).toEqual(1);
    expect(transaction.sdkProcessingMetadata?.dynamicSamplingContext).toEqual({
      environment: 'production',
      public_key: expect.any(String),
      sample_rate: '1',
      sampled: 'true',
      trace_id: expect.any(String),
      transaction: 'test name',
      release: '8.0.0',
    });

    expect(transaction.environment).toEqual('production');
    expect(transaction.event_id).toEqual(expect.any(String));
    expect(transaction.start_timestamp).toEqual(expect.any(Number));
    expect(transaction.timestamp).toEqual(expect.any(Number));
    expect(transaction.transaction).toEqual('test name');

    expect(transaction.tags).toEqual({
      'outer.tag': 'test value',
      'test.tag': 'test value',
    });
    expect(transaction.transaction_info).toEqual({ source: 'task' });
    expect(transaction.type).toEqual('transaction');

    expect(transaction.spans).toHaveLength(2);
    const spans = transaction.spans || [];

    // note: Currently, spans do not have any context/span added to them
    // This is the same behavior as for the "regular" SDKs
    expect(spans).toEqual([
      {
        data: {
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'manual',
        },
        description: 'inner span 1',
        origin: 'manual',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      },
      {
        data: {
          'otel.kind': 'INTERNAL',
          'test.inner': 'test value',
          'sentry.origin': 'manual',
        },
        description: 'inner span 2',
        origin: 'manual',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.any(String),
      },
    ]);
  });

  it('correctly creates concurrent transaction & spans', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const client = getClient() as TestClientInterface;

    addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });

    withIsolationScope(() => {
      startSpan(
        {
          op: 'test op',
          name: 'test name',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          },
        },
        span => {
          addBreadcrumb({ message: 'test breadcrumb 2', timestamp: 123456 });

          span.setAttributes({
            'test.outer': 'test value',
          });

          const subSpan = startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();

          setTag('test.tag', 'test value');

          startSpan({ name: 'inner span 2' }, innerSpan => {
            addBreadcrumb({ message: 'test breadcrumb 3', timestamp: 123456 });

            innerSpan.setAttributes({
              'test.inner': 'test value',
            });
          });
        },
      );
    });

    withIsolationScope(() => {
      startSpan({ op: 'test op b', name: 'test name b' }, span => {
        addBreadcrumb({ message: 'test breadcrumb 2b', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value b',
        });

        const subSpan = startInactiveSpan({ name: 'inner span 1b' });
        subSpan.end();

        setTag('test.tag', 'test value b');

        startSpan({ name: 'inner span 2b' }, innerSpan => {
          addBreadcrumb({ message: 'test breadcrumb 3b', timestamp: 123456 });

          innerSpan.setAttributes({
            'test.inner': 'test value b',
          });
        });
      });
    });

    await client.flush();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(2);
    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test breadcrumb 1', timestamp: 123456 },
          { message: 'test breadcrumb 2', timestamp: 123456 },
          { message: 'test breadcrumb 3', timestamp: 123456 },
        ],
        contexts: expect.objectContaining({
          trace: {
            data: {
              'otel.kind': 'INTERNAL',
              'sentry.op': 'test op',
              'sentry.origin': 'auto.test',
              'sentry.source': 'task',
              'test.outer': 'test value',
              'sentry.sample_rate': 1,
            },
            op: 'test op',
            span_id: expect.any(String),
            status: 'ok',
            trace_id: expect.any(String),
            origin: 'auto.test',
          },
        }),
        spans: [expect.any(Object), expect.any(Object)],
        start_timestamp: expect.any(Number),
        tags: {
          'test.tag': 'test value',
        },
        timestamp: expect.any(Number),
        transaction: 'test name',
        transaction_info: { source: 'task' },
        type: 'transaction',
      }),
      {
        event_id: expect.any(String),
      },
    );

    expect(beforeSendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test breadcrumb 1', timestamp: 123456 },
          { message: 'test breadcrumb 2b', timestamp: 123456 },
          { message: 'test breadcrumb 3b', timestamp: 123456 },
        ],
        contexts: expect.objectContaining({
          trace: {
            data: {
              'otel.kind': 'INTERNAL',
              'sentry.op': 'test op b',
              'sentry.origin': 'manual',
              'sentry.source': 'custom',
              'test.outer': 'test value b',
              'sentry.sample_rate': 1,
            },
            op: 'test op b',
            span_id: expect.any(String),
            status: 'ok',
            trace_id: expect.any(String),
            origin: 'manual',
          },
        }),
        spans: [expect.any(Object), expect.any(Object)],
        start_timestamp: expect.any(Number),
        tags: {
          'test.tag': 'test value b',
        },
        timestamp: expect.any(Number),
        transaction: 'test name b',
        transaction_info: { source: 'custom' },
        type: 'transaction',
      }),
      {
        event_id: expect.any(String),
      },
    );
  });

  it('correctly creates transaction & spans with a trace header data', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const traceState = makeTraceState({
      parentSpanId,
      dsc: undefined,
      sampled: true,
    });

    const spanContext: SpanContext = {
      traceId,
      spanId: parentSpanId,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
      traceState,
    };

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const client = getClient() as TestClientInterface;

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      startSpan(
        {
          op: 'test op',
          name: 'test name',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          },
        },
        () => {
          const subSpan = startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();
          startSpan({ name: 'inner span 2' }, () => {});
        },
      );
    });

    await client.flush();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(beforeSendTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          trace: {
            data: {
              'otel.kind': 'INTERNAL',
              'sentry.op': 'test op',
              'sentry.origin': 'auto.test',
              'sentry.source': 'task',
              'sentry.sample_rate': 1,
            },
            op: 'test op',
            span_id: expect.any(String),
            parent_span_id: parentSpanId,
            status: 'ok',
            trace_id: traceId,
            origin: 'auto.test',
          },
        }),
        // spans are circular (they have a reference to the transaction), which leads to jest choking on this
        // instead we compare them in detail below
        spans: [expect.any(Object), expect.any(Object)],
        start_timestamp: expect.any(Number),
        timestamp: expect.any(Number),
        transaction: 'test name',
        transaction_info: { source: 'task' },
        type: 'transaction',
      }),
      {
        event_id: expect.any(String),
      },
    );

    // Checking the spans here, as they are circular to the transaction...
    const runArgs = beforeSendTransaction.mock.calls[0] as unknown as [TransactionEvent, unknown];
    const spans = runArgs[0]?.spans || [];

    // note: Currently, spans do not have any context/span added to them
    // This is the same behavior as for the "regular" SDKs
    expect(spans).toEqual([
      {
        data: {
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'manual',
        },
        description: 'inner span 1',
        origin: 'manual',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: traceId,
      },
      {
        data: {
          'otel.kind': 'INTERNAL',
          'sentry.origin': 'manual',
        },
        description: 'inner span 2',
        origin: 'manual',
        parent_span_id: expect.any(String),
        span_id: expect.any(String),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: traceId,
      },
    ]);
  });

  it('includes child spans that are finished in the same tick but after their parent span', async () => {
    const now = Date.now();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const logs: unknown[] = [];
    jest.spyOn(logger, 'log').mockImplementation(msg => logs.push(msg));

    const transactions: Event[] = [];

    mockSdkInit({
      enableTracing: true,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });

    startSpanManual({ name: 'test name' }, async span => {
      const subSpan = startInactiveSpan({ name: 'inner span 1' });
      subSpan.end();

      const subSpan2 = startInactiveSpan({ name: 'inner span 2' });

      span.end();
      subSpan2.end();
    });

    jest.advanceTimersByTime(1);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.spans).toHaveLength(2);
  });

  it('uses & inherits DSC on span trace state', async () => {
    const transactionEvents: Event[] = [];
    const beforeSendTransaction = jest.fn(event => {
      transactionEvents.push(event);
      return null;
    });

    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const dscString = `sentry-transaction=other-transaction,sentry-environment=other,sentry-release=8.0.0,sentry-public_key=public,sentry-trace_id=${traceId},sentry-sampled=true`;

    const spanContext: SpanContext = {
      traceId,
      spanId: parentSpanId,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
      traceState: new TraceState().set(SENTRY_TRACE_STATE_DSC, dscString),
    };

    mockSdkInit({
      enableTracing: true,
      beforeSendTransaction,
      release: '7.0.0',
    });

    const client = getClient() as TestClientInterface;

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(ROOT_CONTEXT, spanContext), () => {
      startSpan(
        {
          op: 'test op',
          name: 'test name',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          },
        },
        span => {
          expect(span.spanContext().traceState?.get(SENTRY_TRACE_STATE_DSC)).toEqual(dscString);

          const subSpan = startInactiveSpan({ name: 'inner span 1' });

          expect(subSpan.spanContext().traceState?.get(SENTRY_TRACE_STATE_DSC)).toEqual(dscString);

          subSpan.end();

          startSpan({ name: 'inner span 2' }, subSpan => {
            expect(subSpan.spanContext().traceState?.get(SENTRY_TRACE_STATE_DSC)).toEqual(dscString);
          });
        },
      );
    });

    await client.flush();

    expect(transactionEvents).toHaveLength(1);
    expect(transactionEvents[0]?.sdkProcessingMetadata?.dynamicSamplingContext).toEqual({
      environment: 'other',
      public_key: 'public',
      release: '8.0.0',
      sampled: 'true',
      trace_id: traceId,
      transaction: 'other-transaction',
    });
  });
});
