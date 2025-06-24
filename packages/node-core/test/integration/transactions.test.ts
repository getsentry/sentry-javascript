import { context, trace, TraceFlags } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { TransactionEvent } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '../../src';
import { cleanupOtel, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | Transactions', () => {
  let provider: BasicTracerProvider | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupOtel(provider);
  });

  it('correctly creates transaction & spans', async () => {
    const transactions: TransactionEvent[] = [];
    const beforeSendTransaction = vi.fn(event => {
      transactions.push(event);
      return null;
    });

    provider = mockSdkInit({
      tracesSampleRate: 1,
      beforeSendTransaction,
      release: '8.0.0',
    });

    const client = Sentry.getClient()!;

    Sentry.addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });
    Sentry.setTag('outer.tag', 'test value');

    Sentry.startSpan(
      {
        op: 'test op',
        name: 'test name',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
        },
      },
      span => {
        Sentry.addBreadcrumb({ message: 'test breadcrumb 2', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value',
        });

        const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
        subSpan.end();

        Sentry.setTag('test.tag', 'test value');

        Sentry.startSpan({ name: 'inner span 2' }, innerSpan => {
          Sentry.addBreadcrumb({ message: 'test breadcrumb 3', timestamp: 123456 });

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
        'service.name': expect.any(String),
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
      release: '8.0.0',
      trace_id: expect.stringMatching(/[a-f0-9]{32}/),
      transaction: 'test name',
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

    provider = mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

    const client = Sentry.getClient()!;

    Sentry.addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });

    Sentry.withIsolationScope(() => {
      Sentry.startSpan(
        {
          op: 'test op',
          name: 'test name',
          attributes: {
            [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
            [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          },
        },
        span => {
          Sentry.addBreadcrumb({ message: 'test breadcrumb 2', timestamp: 123456 });

          span.setAttributes({
            'test.outer': 'test value',
          });

          const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();

          Sentry.setTag('test.tag', 'test value');

          Sentry.startSpan({ name: 'inner span 2' }, innerSpan => {
            Sentry.addBreadcrumb({ message: 'test breadcrumb 3', timestamp: 123456 });

            innerSpan.setAttributes({
              'test.inner': 'test value',
            });
          });
        },
      );
    });

    Sentry.withIsolationScope(() => {
      Sentry.startSpan({ op: 'test op b', name: 'test name b' }, span => {
        Sentry.addBreadcrumb({ message: 'test breadcrumb 2b', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value b',
        });

        const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1b' });
        subSpan.end();

        Sentry.setTag('test.tag', 'test value b');

        Sentry.startSpan({ name: 'inner span 2b' }, innerSpan => {
          Sentry.addBreadcrumb({ message: 'test breadcrumb 3b', timestamp: 123456 });

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

  it('correctly creates concurrent transaction & spans when using native OTEL tracer', async () => {
    const beforeSendTransaction = vi.fn(() => null);

    provider = mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

    const client = Sentry.getClient<Sentry.NodeClient>();

    Sentry.addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });

    Sentry.withIsolationScope(() => {
      client?.tracer.startActiveSpan('test name', span => {
        Sentry.addBreadcrumb({ message: 'test breadcrumb 2', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value',
        });

        const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
        subSpan.end();

        Sentry.setTag('test.tag', 'test value');

        client.tracer.startActiveSpan('inner span 2', innerSpan => {
          Sentry.addBreadcrumb({ message: 'test breadcrumb 3', timestamp: 123456 });

          innerSpan.setAttributes({
            'test.inner': 'test value',
          });

          innerSpan.end();
        });

        span.end();
      });
    });

    Sentry.withIsolationScope(() => {
      client?.tracer.startActiveSpan('test name b', span => {
        Sentry.addBreadcrumb({ message: 'test breadcrumb 2b', timestamp: 123456 });

        span.setAttributes({
          'test.outer': 'test value b',
        });

        const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1b' });
        subSpan.end();

        Sentry.setTag('test.tag', 'test value b');

        client.tracer.startActiveSpan('inner span 2b', innerSpan => {
          Sentry.addBreadcrumb({ message: 'test breadcrumb 3b', timestamp: 123456 });

          innerSpan.setAttributes({
            'test.inner': 'test value b',
          });

          innerSpan.end();
        });

        span.end();
      });
    });

    await client?.flush();

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
              'sentry.origin': 'manual',
              'sentry.source': 'custom',
              'test.outer': 'test value',
              'sentry.sample_rate': 1,
            },
            span_id: expect.stringMatching(/[a-f0-9]{16}/),
            status: 'ok',
            trace_id: expect.stringMatching(/[a-f0-9]{32}/),
            origin: 'manual',
          },
        }),
        spans: [expect.any(Object), expect.any(Object)],
        start_timestamp: expect.any(Number),
        tags: {
          'test.tag': 'test value',
        },
        timestamp: expect.any(Number),
        transaction: 'test name',
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
              'sentry.origin': 'manual',
              'sentry.source': 'custom',
              'test.outer': 'test value b',
              'sentry.sample_rate': 1,
            },
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

    const spanContext = {
      traceId,
      spanId: parentSpanId,
      sampled: true,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    };

    provider = mockSdkInit({ tracesSampleRate: 1, beforeSendTransaction });

    const client = Sentry.getClient()!;

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(trace.setSpanContext(context.active(), spanContext), () => {
      Sentry.startSpan(
        {
          op: 'test op',
          name: 'test name',
          attributes: {
            [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
            [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.test',
          },
        },
        () => {
          const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();

          Sentry.startSpan({ name: 'inner span 2' }, () => {});
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
});
