import type { SpanContext } from '@opentelemetry/api';
import { context, ROOT_CONTEXT, trace, TraceFlags } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import type { Event, TransactionEvent } from '@sentry/core';
import {
  addBreadcrumb,
  debug,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setTag,
  startSpanManual,
  withIsolationScope,
} from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENTRY_TRACE_STATE_DSC } from '../../src/constants';
import { startInactiveSpan, startSpan } from '../../src/trace';
import { makeTraceState } from '../../src/utils/makeTraceState';
import { cleanupOtel, getSpanProcessor, mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClientInterface } from '../helpers/TestClient';

describe('Integration | Transactions', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await cleanupOtel();
  });

  it('correctly creates transaction & spans', async () => {
    const transactions: TransactionEvent[] = [];
    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });

    mockSdkInit({
      tracesSampleRate: 1,
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
        'sentry.op': 'test op',
        'sentry.origin': 'auto.test',
        'sentry.source': 'task',
        'sentry.sample_rate': 1,
        'test.outer': 'test value',
      },
      op: 'test op',
      span_id: expect.stringMatching(/[a-f0-9]{16}/),
      status: 'ok',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      origin: 'auto.test',
    });

    expect(transaction.sdkProcessingMetadata?.sampleRate).toEqual(1);
    expect(transaction.sdkProcessingMetadata?.dynamicSamplingContext).toEqual({
      environment: 'production',
      public_key: expect.any(String),
      sample_rate: '1',
      sampled: 'true',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      transaction: 'test name',
      release: '8.0.0',
      sample_rand: expect.any(String),
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
          'sentry.origin': 'manual',
        },
        description: 'inner span 1',
        origin: 'manual',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
      {
        data: {
          'test.inner': 'test value',
          'sentry.origin': 'manual',
        },
        description: 'inner span 2',
        origin: 'manual',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      },
    ]);
  });

  it('correctly creates concurrent transaction & spans', async () => {
    const beforeSendTransaction = vi.fn(() => null);

    mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

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
              'sentry.op': 'test op',
              'sentry.origin': 'auto.test',
              'sentry.source': 'task',
              'test.outer': 'test value',
              'sentry.sample_rate': 1,
            },
            op: 'test op',
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            status: 'ok',
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
              'sentry.op': 'test op b',
              'sentry.origin': 'manual',
              'sentry.source': 'custom',
              'test.outer': 'test value b',
              'sentry.sample_rate': 1,
            },
            op: 'test op b',
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            status: 'ok',
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
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
    const beforeSendTransaction = vi.fn(() => null);

    const traceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const parentSpanId = '6e0c63257de34c92';

    const traceState = makeTraceState({
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

    mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

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
              'sentry.op': 'test op',
              'sentry.origin': 'auto.test',
              'sentry.source': 'task',
            },
            op: 'test op',
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
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
    const spans = runArgs[0].spans || [];

    // note: Currently, spans do not have any context/span added to them
    // This is the same behavior as for the "regular" SDKs
    expect(spans).toEqual([
      {
        data: {
          'sentry.origin': 'manual',
        },
        description: 'inner span 1',
        origin: 'manual',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: traceId,
      },
      {
        data: {
          'sentry.origin': 'manual',
        },
        description: 'inner span 2',
        origin: 'manual',
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        start_timestamp: expect.any(Number),
        status: 'ok',
        timestamp: expect.any(Number),
        trace_id: traceId,
      },
    ]);
  });

  it('cleans up spans that are not flushed for over 5 mins', async () => {
    const beforeSendTransaction = vi.fn(() => null);

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const logs: unknown[] = [];
    vi.spyOn(debug, 'log').mockImplementation(msg => logs.push(msg));

    mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

    const spanProcessor = getSpanProcessor();

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    void startSpan({ name: 'test name' }, async () => {
      startInactiveSpan({ name: 'inner span 1' }).end();
      startInactiveSpan({ name: 'inner span 2' }).end();

      // Pretend this is pending for 10 minutes
      await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
    });

    // Child-spans have been added to the exporter, but they are pending since they are waiting for their parent
    const finishedSpans1 = [];
    exporter['_finishedSpanBuckets'].forEach(bucket => {
      if (bucket) {
        finishedSpans1.push(...bucket.spans);
      }
    });
    expect(finishedSpans1.length).toBe(2);
    expect(beforeSendTransaction).toHaveBeenCalledTimes(0);

    // Now wait for 5 mins
    vi.advanceTimersByTime(5 * 60 * 1_000 + 1);

    // Adding another span will trigger the cleanup
    startSpan({ name: 'other span' }, () => {});

    vi.advanceTimersByTime(1);

    // Old spans have been cleared away
    const finishedSpans2 = [];
    exporter['_finishedSpanBuckets'].forEach(bucket => {
      if (bucket) {
        finishedSpans2.push(...bucket.spans);
      }
    });
    expect(finishedSpans2.length).toBe(0);

    // Called once for the 'other span'
    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);

    expect(logs).toEqual(
      expect.arrayContaining([
        'SpanExporter dropped 2 spans because they were pending for more than 300 seconds.',
        'SpanExporter exported 1 spans, 0 spans are waiting for their parent spans to finish',
      ]),
    );
  });

  it('includes child spans that are finished in the same tick but after their parent span', async () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const logs: unknown[] = [];
    vi.spyOn(debug, 'log').mockImplementation(msg => logs.push(msg));

    const transactions: Event[] = [];

    mockSdkInit({
      tracesSampleRate: 1,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });

    const spanProcessor = getSpanProcessor();

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    startSpanManual({ name: 'test name' }, async span => {
      const subSpan = startInactiveSpan({ name: 'inner span 1' });
      subSpan.end();

      const subSpan2 = startInactiveSpan({ name: 'inner span 2' });

      span.end();
      subSpan2.end();
    });

    vi.advanceTimersByTime(1);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.spans).toHaveLength(2);

    // No spans are pending
    const finishedSpans = [];
    exporter['_finishedSpanBuckets'].forEach(bucket => {
      if (bucket) {
        finishedSpans.push(...bucket.spans);
      }
    });
    expect(finishedSpans.length).toBe(0);
  });

  it('collects child spans that are finished within 5 minutes their parent span has been sent', async () => {
    const timeout = 5 * 60 * 1000;
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const logs: unknown[] = [];
    vi.spyOn(debug, 'log').mockImplementation(msg => logs.push(msg));

    const transactions: Event[] = [];

    mockSdkInit({
      tracesSampleRate: 1,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });

    const spanProcessor = getSpanProcessor();

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    startSpanManual({ name: 'test name' }, async span => {
      const subSpan = startInactiveSpan({ name: 'inner span 1' });
      subSpan.end();

      const subSpan2 = startInactiveSpan({ name: 'inner span 2' });

      span.end();

      setTimeout(() => {
        subSpan2.end();
      }, timeout - 2);
    });

    vi.advanceTimersByTime(timeout - 1);

    expect(transactions).toHaveLength(2);
    expect(transactions[0]?.spans).toHaveLength(1);

    expect(transactions[0]?.transaction).toBe('test name');
    expect(transactions[0]?.contexts?.trace?.data).toEqual({
      'sentry.origin': 'manual',
      'sentry.sample_rate': 1,
      'sentry.source': 'custom',
    });

    expect(transactions[1]?.transaction).toBe('inner span 2');
    expect(transactions[1]?.contexts?.trace?.data).toEqual({
      'sentry.parent_span_already_sent': true,
      'sentry.origin': 'manual',
      'sentry.source': 'custom',
    });

    const finishedSpans: any = exporter['_finishedSpanBuckets'].flatMap(bucket =>
      bucket ? Array.from(bucket.spans) : [],
    );
    expect(finishedSpans.length).toBe(0);
  });

  it('discards child spans that are finished after 5 minutes their parent span has been sent', async () => {
    const timeout = 5 * 60 * 1000;
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const logs: unknown[] = [];
    vi.spyOn(debug, 'log').mockImplementation(msg => logs.push(msg));

    const transactions: Event[] = [];

    mockSdkInit({
      tracesSampleRate: 1,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });

    const spanProcessor = getSpanProcessor();

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    startSpanManual({ name: 'test name' }, async span => {
      const subSpan = startInactiveSpan({ name: 'inner span 1' });
      subSpan.end();

      const subSpan2 = startInactiveSpan({ name: 'inner span 2' });

      span.end();

      setTimeout(() => {
        subSpan2.end();
      }, timeout + 1);
    });

    vi.advanceTimersByTime(timeout + 2);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.spans).toHaveLength(1);

    // subSpan2 is pending (and will eventually be cleaned up)
    const finishedSpans: any = [];
    exporter['_finishedSpanBuckets'].forEach(bucket => {
      if (bucket) {
        finishedSpans.push(...bucket.spans);
      }
    });
    expect(finishedSpans.length).toBe(1);
    expect(finishedSpans[0]?.name).toBe('inner span 2');
  });

  it('only considers sent spans, not finished spans, for flushing orphaned spans of sent spans', async () => {
    const timeout = 5 * 60 * 1000;
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const logs: unknown[] = [];
    vi.spyOn(debug, 'log').mockImplementation(msg => logs.push(msg));

    const transactions: Event[] = [];

    mockSdkInit({
      tracesSampleRate: 1,
      beforeSendTransaction: event => {
        transactions.push(event);
        return null;
      },
    });

    const spanProcessor = getSpanProcessor();

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    /**
     * This is our span structure:
     * span 1 --------
     *    span 2 ---
     *      span 3 -
     *
     * Where span 2 is finished before span 3 & span 1
     */

    const [span1, span3] = startSpanManual({ name: 'span 1' }, span1 => {
      const [span2, span3] = startSpanManual({ name: 'span 2' }, span2 => {
        const span3 = startInactiveSpan({ name: 'span 3' });
        return [span2, span3];
      });

      // End span 2 before span 3
      span2.end();

      return [span1, span3];
    });

    vi.advanceTimersByTime(1);

    // nothing should be sent yet, as span1 is not yet done
    expect(transactions).toHaveLength(0);

    // Now finish span1, should be sent with only span2 but without span3, as that is not yet finished
    span1.end();
    vi.advanceTimersByTime(1);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.spans).toHaveLength(1);

    // now finish span3, which should be sent as transaction too
    span3.end();
    vi.advanceTimersByTime(timeout);

    expect(transactions).toHaveLength(2);
    expect(transactions[1]?.spans).toHaveLength(0);
  });

  it('uses & inherits DSC on span trace state', async () => {
    const transactionEvents: Event[] = [];
    const beforeSendTransaction = vi.fn(event => {
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
      tracesSampleRate: 1,
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
