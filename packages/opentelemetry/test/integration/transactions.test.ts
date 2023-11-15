import { context, trace, TraceFlags } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { addBreadcrumb, setTag } from '@sentry/core';
import type { PropagationContext, TransactionEvent } from '@sentry/types';
import { logger } from '@sentry/utils';

import { getCurrentHub } from '../../src/custom/hub';
import { SentrySpanProcessor } from '../../src/spanProcessor';
import { startInactiveSpan, startSpan } from '../../src/trace';
import { setPropagationContextOnContext } from '../../src/utils/contextData';
import { cleanupOtel, getProvider, mockSdkInit } from '../helpers/mockSdkInit';
import type { TestClientInterface } from '../helpers/TestClient';

describe('Integration | Transactions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    cleanupOtel();
  });

  it('correctly creates transaction & spans', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const hub = getCurrentHub();
    const client = hub.getClient() as TestClientInterface;

    addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });
    setTag('outer.tag', 'test value');

    startSpan(
      {
        op: 'test op',
        name: 'test name',
        source: 'task',
        origin: 'auto.test',
        metadata: { requestPath: 'test-path' },
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

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(beforeSendTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        breadcrumbs: [
          { message: 'test breadcrumb 1', timestamp: 123456 },
          { message: 'test breadcrumb 2', timestamp: 123456 },
          { message: 'test breadcrumb 3', timestamp: 123456 },
        ],
        contexts: {
          otel: {
            attributes: {
              'test.outer': 'test value',
            },
            resource: {
              'service.name': 'opentelemetry-test',
              'service.namespace': 'sentry',
              'service.version': expect.any(String),
              'telemetry.sdk.language': 'nodejs',
              'telemetry.sdk.name': 'opentelemetry',
              'telemetry.sdk.version': expect.any(String),
            },
          },
          trace: {
            data: { 'otel.kind': 'INTERNAL' },
            op: 'test op',
            span_id: expect.any(String),
            status: 'ok',
            trace_id: expect.any(String),
            origin: 'auto.test',
          },
        },
        environment: 'production',
        event_id: expect.any(String),
        sdkProcessingMetadata: expect.objectContaining({
          dynamicSamplingContext: expect.objectContaining({
            environment: 'production',
            public_key: expect.any(String),
            sample_rate: '1',
            sampled: 'true',
            trace_id: expect.any(String),
            transaction: 'test name',
          }),
          propagationContext: {
            sampled: undefined,
            spanId: expect.any(String),
            traceId: expect.any(String),
          },
          sampleRate: 1,
          source: 'task',
          spanMetadata: expect.any(Object),
          requestPath: 'test-path',
        }),
        // spans are circular (they have a reference to the transaction), which leads to jest choking on this
        // instead we compare them in detail below
        spans: [
          expect.objectContaining({
            description: 'inner span 1',
          }),
          expect.objectContaining({
            description: 'inner span 2',
          }),
        ],
        start_timestamp: expect.any(Number),
        tags: {
          'outer.tag': 'test value',
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

    // Checking the spans here, as they are circular to the transaction...
    const runArgs = beforeSendTransaction.mock.calls[0] as unknown as [TransactionEvent, unknown];
    const spans = runArgs[0].spans || [];

    // note: Currently, spans do not have any context/span added to them
    // This is the same behavior as for the "regular" SDKs
    expect(spans.map(span => span.toJSON())).toEqual([
      {
        data: { 'otel.kind': 'INTERNAL' },
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
        data: { 'otel.kind': 'INTERNAL', 'test.inner': 'test value' },
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

    const hub = getCurrentHub();
    const client = hub.getClient() as TestClientInterface;

    addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });

    startSpan({ op: 'test op', name: 'test name', source: 'task', origin: 'auto.test' }, span => {
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
    });

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
          otel: expect.objectContaining({
            attributes: {
              'test.outer': 'test value',
            },
          }),
          trace: {
            data: { 'otel.kind': 'INTERNAL' },
            op: 'test op',
            span_id: expect.any(String),
            status: 'ok',
            trace_id: expect.any(String),
            origin: 'auto.test',
          },
        }),
        spans: [
          expect.objectContaining({
            description: 'inner span 1',
          }),
          expect.objectContaining({
            description: 'inner span 2',
          }),
        ],
        start_timestamp: expect.any(Number),
        tags: {},
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
          otel: expect.objectContaining({
            attributes: {
              'test.outer': 'test value b',
            },
          }),
          trace: {
            data: { 'otel.kind': 'INTERNAL' },
            op: 'test op b',
            span_id: expect.any(String),
            status: 'ok',
            trace_id: expect.any(String),
            origin: 'manual',
          },
        }),
        spans: [
          expect.objectContaining({
            description: 'inner span 1b',
          }),
          expect.objectContaining({
            description: 'inner span 2b',
          }),
        ],
        start_timestamp: expect.any(Number),
        tags: {},
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

    const spanContext = {
      traceId,
      spanId: parentSpanId,
      sampled: true,
      isRemote: true,
      traceFlags: TraceFlags.SAMPLED,
    };

    const propagationContext: PropagationContext = {
      traceId,
      parentSpanId,
      spanId: '6e0c63257de34c93',
      sampled: true,
    };

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const hub = getCurrentHub();
    const client = hub.getClient() as TestClientInterface;

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(
      trace.setSpanContext(setPropagationContextOnContext(context.active(), propagationContext), spanContext),
      () => {
        startSpan({ op: 'test op', name: 'test name', source: 'task', origin: 'auto.test' }, () => {
          const subSpan = startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();

          startSpan({ name: 'inner span 2' }, () => {});
        });
      },
    );

    await client.flush();

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
    expect(beforeSendTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contexts: expect.objectContaining({
          otel: expect.objectContaining({
            attributes: {},
          }),
          trace: {
            data: { 'otel.kind': 'INTERNAL' },
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
        spans: [
          expect.objectContaining({
            description: 'inner span 1',
          }),
          expect.objectContaining({
            description: 'inner span 2',
          }),
        ],
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
    expect(spans.map(span => span.toJSON())).toEqual([
      {
        data: { 'otel.kind': 'INTERNAL' },
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
        data: { 'otel.kind': 'INTERNAL' },
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

  it('cleans up spans that are not flushed for over 5 mins', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    const now = Date.now();
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const logs: unknown[] = [];
    jest.spyOn(logger, 'log').mockImplementation(msg => logs.push(msg));

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const hub = getCurrentHub();
    const client = hub.getClient() as TestClientInterface;
    const provider = getProvider();
    const multiSpanProcessor = provider?.activeSpanProcessor as
      | (SpanProcessor & { _spanProcessors?: SpanProcessor[] })
      | undefined;
    const spanProcessor = multiSpanProcessor?.['_spanProcessors']?.find(
      spanProcessor => spanProcessor instanceof SentrySpanProcessor,
    ) as SentrySpanProcessor | undefined;

    const exporter = spanProcessor ? spanProcessor['_exporter'] : undefined;

    if (!exporter) {
      throw new Error('No exporter found, aborting test...');
    }

    let innerSpan1Id: string | undefined;
    let innerSpan2Id: string | undefined;

    void startSpan({ name: 'test name' }, async span => {
      if (!span) {
        return;
      }

      const subSpan = startInactiveSpan({ name: 'inner span 1' });
      innerSpan1Id = subSpan?.spanContext().spanId;
      subSpan?.end();

      startSpan({ name: 'inner span 2' }, innerSpan => {
        if (!innerSpan) {
          return;
        }

        innerSpan2Id = innerSpan.spanContext().spanId;
      });

      // Pretend this is pending for 10 minutes
      await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
    });

    // Nothing added to exporter yet
    expect(exporter['_finishedSpans'].length).toBe(0);

    void client.flush(5_000);
    jest.advanceTimersByTime(5_000);

    // Now the child-spans have been added to the exporter, but they are pending since they are waiting for their parant
    expect(exporter['_finishedSpans'].length).toBe(2);
    expect(beforeSendTransaction).toHaveBeenCalledTimes(0);

    // Now wait for 5 mins
    jest.advanceTimersByTime(5 * 60 * 1_000);

    // Adding another span will trigger the cleanup
    startSpan({ name: 'other span' }, () => {});

    void client.flush(5_000);
    jest.advanceTimersByTime(5_000);

    // Old spans have been cleared away
    expect(exporter['_finishedSpans'].length).toBe(0);

    // Called once for the 'other span'
    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);

    expect(logs).toEqual(
      expect.arrayContaining([
        'SpanExporter exported 0 spans, 2 unsent spans remaining',
        'SpanExporter exported 1 spans, 2 unsent spans remaining',
        `SpanExporter dropping span inner span 1 (${innerSpan1Id}) because it is pending for more than 5 minutes.`,
        `SpanExporter dropping span inner span 2 (${innerSpan2Id}) because it is pending for more than 5 minutes.`,
      ]),
    );
  });
});
