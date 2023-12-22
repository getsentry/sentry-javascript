import { SpanKind, TraceFlags, context, trace } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { SentrySpanProcessor, getCurrentHub, setPropagationContextOnContext } from '@sentry/opentelemetry';
import type { Integration, PropagationContext, TransactionEvent } from '@sentry/types';
import { logger } from '@sentry/utils';

import * as Sentry from '../../src';
import { startSpan } from '../../src';
import type { Http, NodeFetch } from '../../src/integrations';
import type { NodeExperimentalClient } from '../../src/types';
import { cleanupOtel, getProvider, mockSdkInit } from '../helpers/mockSdkInit';

describe('Integration | Transactions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    cleanupOtel();
  });

  it('correctly creates transaction & spans', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    const client = Sentry.getClient<NodeExperimentalClient>();

    Sentry.addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });
    Sentry.setTag('outer.tag', 'test value');

    Sentry.startSpan(
      {
        op: 'test op',
        name: 'test name',
        source: 'task',
        origin: 'auto.test',
        metadata: { requestPath: 'test-path' },
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
              'service.name': 'node-experimental',
              'service.namespace': 'sentry',
              'service.version': expect.any(String),
              'telemetry.sdk.language': 'nodejs',
              'telemetry.sdk.name': 'opentelemetry',
              'telemetry.sdk.version': expect.any(String),
            },
          },
          runtime: { name: 'node', version: expect.any(String) },
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
        platform: 'node',
        sdkProcessingMetadata: {
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
        },
        server_name: expect.any(String),
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

    const client = Sentry.getClient();

    Sentry.addBreadcrumb({ message: 'test breadcrumb 1', timestamp: 123456 });

    Sentry.withIsolationScope(() => {
      Sentry.startSpan({ op: 'test op', name: 'test name', source: 'task', origin: 'auto.test' }, span => {
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
      });
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
        tags: { 'test.tag': 'test value' },
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
        tags: { 'test.tag': 'test value b' },
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
    const client = hub.getClient() as NodeExperimentalClient;

    // We simulate the correct context we'd normally get from the SentryPropagator
    context.with(
      trace.setSpanContext(setPropagationContextOnContext(context.active(), propagationContext), spanContext),
      () => {
        Sentry.startSpan({ op: 'test op', name: 'test name', source: 'task', origin: 'auto.test' }, () => {
          const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
          subSpan.end();

          Sentry.startSpan({ name: 'inner span 2' }, () => {});
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
    const client = hub.getClient() as NodeExperimentalClient;
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

    void Sentry.startSpan({ name: 'test name' }, async () => {
      const subSpan = Sentry.startInactiveSpan({ name: 'inner span 1' });
      innerSpan1Id = subSpan?.spanContext().spanId;
      subSpan.end();

      Sentry.startSpan({ name: 'inner span 2' }, innerSpan => {
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
    Sentry.startSpan({ name: 'other span' }, () => {});

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

  it('does not create spans for http requests if disabled in http integration', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    jest.useFakeTimers();

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    jest.spyOn(client, 'getIntegration').mockImplementation(integrationClass => {
      if (integrationClass.name === 'Http') {
        return {
          shouldCreateSpansForRequests: false,
        } as Http;
      }

      return {} as Integration;
    });

    client.tracer.startActiveSpan(
      'test op',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.HTTP_METHOD]: 'GET',
          [SemanticAttributes.HTTP_URL]: 'https://example.com',
        },
      },
      span => {
        startSpan({ name: 'inner 1' }, () => {
          startSpan({ name: 'inner 2' }, () => {});
        });

        span.end();
      },
    );

    void client.flush();
    jest.advanceTimersByTime(5_000);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(0);

    // Now try a non-HTTP span
    client.tracer.startActiveSpan(
      'test op 2',
      {
        kind: SpanKind.CLIENT,
        attributes: {},
      },
      span => {
        startSpan({ name: 'inner 1' }, () => {
          startSpan({ name: 'inner 2' }, () => {});
        });

        span.end();
      },
    );

    void client.flush();
    jest.advanceTimersByTime(5_000);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not create spans for fetch requests if disabled in fetch integration', async () => {
    const beforeSendTransaction = jest.fn(() => null);

    mockSdkInit({ enableTracing: true, beforeSendTransaction });

    jest.useFakeTimers();

    const hub = getCurrentHub();
    const client = hub.getClient() as NodeExperimentalClient;

    jest.spyOn(client, 'getIntegration').mockImplementation(integrationClass => {
      if (integrationClass.name === 'NodeFetch') {
        return {
          shouldCreateSpansForRequests: false,
        } as NodeFetch;
      }

      return {} as Integration;
    });

    client.tracer.startActiveSpan(
      'test op',
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.HTTP_METHOD]: 'GET',
          [SemanticAttributes.HTTP_URL]: 'https://example.com',
          'http.client': 'fetch',
        },
      },
      span => {
        startSpan({ name: 'inner 1' }, () => {
          startSpan({ name: 'inner 2' }, () => {});
        });

        span.end();
      },
    );

    void client.flush();
    jest.advanceTimersByTime(5_000);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(0);

    // Now try a non-HTTP span
    client.tracer.startActiveSpan(
      'test op 2',
      {
        kind: SpanKind.CLIENT,
        attributes: {},
      },
      span => {
        startSpan({ name: 'inner 1' }, () => {
          startSpan({ name: 'inner 2' }, () => {});
        });

        span.end();
      },
    );

    void client.flush();
    jest.advanceTimersByTime(5_000);

    expect(beforeSendTransaction).toHaveBeenCalledTimes(1);
  });
});
