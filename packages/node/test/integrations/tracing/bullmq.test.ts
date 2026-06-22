import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as SentryCore from '@sentry/core';
import { BullMQTelemetry } from '../../../src/integrations/tracing/bullmq';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return {
    ...actual,
    startInactiveSpan: vi.fn(() => mockOtelSpan()),
    getActiveSpan: vi.fn(() => undefined),
    getCurrentScope: vi.fn(() => mockScope()),
    withActiveSpan: vi.fn((_span, fn) => fn()),
    withIsolationScope: vi.fn(fn => fn()),
    spanToTraceHeader: vi.fn(() => '00-traceid-spanid-01'),
    captureException: vi.fn(),
    metrics: {
      count: vi.fn(),
      distribution: vi.fn(),
      gauge: vi.fn(),
    },
  };
});

function mockOtelSpan() {
  return {
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
    addLink: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
    spanContext: () => ({ spanId: 'abc123', traceId: 'def456', traceFlags: 1 }),
  };
}

function mockScope() {
  return {
    setTag: vi.fn(),
    setContext: vi.fn(),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('BullMQTelemetry', () => {
  it('exposes tracer, contextManager, and meter', () => {
    const telemetry = new BullMQTelemetry();

    expect(telemetry.tracer).toBeDefined();
    expect(telemetry.contextManager).toBeDefined();
    expect(telemetry.meter).toBeDefined();
  });
});

describe('SentryBullMQTracer', () => {
  describe('startSpan', () => {
    it.each([
      { name: 'add myQueue', expectedOp: 'queue.submit', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addBulk myQueue', expectedOp: 'queue.submit', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addFlow myQueue', expectedOp: 'queue.submit', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addBulkFlows myQueue', expectedOp: 'queue.submit', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'process myQueue', expectedOp: 'queue.task', expectedOrigin: 'auto.queue.bullmq.consumer' },
      { name: 'pause myQueue', expectedOp: 'queue', expectedOrigin: 'auto.queue.bullmq' },
      { name: 'close myQueue', expectedOp: 'queue', expectedOrigin: 'auto.queue.bullmq' },
      { name: 'drain myQueue', expectedOp: 'queue', expectedOrigin: 'auto.queue.bullmq' },
      { name: 'getNextJob myQueue', expectedOp: 'queue', expectedOrigin: 'auto.queue.bullmq' },
    ])('maps "$name" to op=$expectedOp and origin=$expectedOrigin', ({ name, expectedOp, expectedOrigin }) => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan(name);

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith({
        name,
        attributes: {
          [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_OP]: expectedOp,
          [SentryCore.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: expectedOrigin,
          'messaging.system': 'bullmq',
        },
        forceTransaction: expectedOp === 'queue.task',
      });
    });

    it('merges user-provided attributes from SpanOptions', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('add emails', {
        attributes: { 'messaging.destination.name': 'emails' },
      });

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'messaging.destination.name': 'emails',
          }),
        }),
      );
    });

    it('forces transaction for queue.task spans', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('process notifications');

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ forceTransaction: true }));
    });

    it('does not force transaction for queue.submit spans', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('add notifications');

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ forceTransaction: false }));
    });

    it('adds span link to producer when context has producerSpanContext', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('process myQueue', undefined, {
        span: undefined,
        scope: mockScope() as any,
        producerSpanContext: {
          traceId: 'aabbccddaabbccddaabbccddaabbccdd',
          spanId: '1122334455667788',
          sampled: true,
        },
      });

      const span = vi.mocked(SentryCore.startInactiveSpan).mock.results[0]!.value;
      expect(span.addLink).toHaveBeenCalledWith({
        context: {
          traceId: 'aabbccddaabbccddaabbccddaabbccdd',
          spanId: '1122334455667788',
          traceFlags: 1,
        },
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      });
      expect(span.setAttribute).toHaveBeenCalledWith(
        'sentry.previous_trace',
        'aabbccddaabbccddaabbccddaabbccdd-1122334455667788-1',
      );
    });

    it('does not add span link when context has no producerSpanContext', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('process myQueue', undefined, {
        span: undefined,
        scope: mockScope() as any,
      });

      const span = vi.mocked(SentryCore.startInactiveSpan).mock.results[0]!.value;
      expect(span.addLink).not.toHaveBeenCalled();
    });
  });
});

describe('SentryBullMQSpan', () => {
  function createSpan() {
    const telemetry = new BullMQTelemetry();
    const span = telemetry.tracer.startSpan('Queue.add test-queue');
    const otelSpan = vi.mocked(SentryCore.startInactiveSpan).mock.results[0]!.value;
    return { span, otelSpan };
  }

  it('delegates setAttribute to the underlying OTel span', () => {
    const { span, otelSpan } = createSpan();

    span.setAttribute('messaging.destination.name', 'emails');

    expect(otelSpan.setAttribute).toHaveBeenCalledWith('messaging.destination.name', 'emails');
  });

  it('delegates setAttributes to the underlying OTel span', () => {
    const { span, otelSpan } = createSpan();

    span.setAttributes({ 'messaging.destination.name': 'emails', 'messaging.message.id': '42' });

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      'messaging.destination.name': 'emails',
      'messaging.message.id': '42',
    });
  });

  it('delegates addEvent to the underlying OTel span', () => {
    const { span, otelSpan } = createSpan();

    span.addEvent('job.retry', { 'bullmq.job.attempt': 3 });

    expect(otelSpan.addEvent).toHaveBeenCalledWith('job.retry', { 'bullmq.job.attempt': 3 });
  });

  it('delegates addEvent without attributes', () => {
    const { span, otelSpan } = createSpan();

    span.addEvent('job.completed');

    expect(otelSpan.addEvent).toHaveBeenCalledWith('job.completed', undefined);
  });

  describe('recordException', () => {
    it('records Error instances on the OTel span and captures via Sentry', () => {
      const { span, otelSpan } = createSpan();
      const error = new Error('Redis connection refused');

      span.recordException(error);

      expect(otelSpan.recordException).toHaveBeenCalledWith(error);
      expect(SentryCore.captureException).toHaveBeenCalledWith(error, {
        mechanism: { handled: false, type: 'auto.queue.bullmq' },
      });
    });

    it('wraps non-Error exception objects in an Error and captures via Sentry', () => {
      const { span, otelSpan } = createSpan();

      span.recordException({ code: 503, message: 'Service unavailable' });

      const wrappedError = new Error('Service unavailable');
      expect(otelSpan.recordException).toHaveBeenCalledWith(wrappedError);
      expect(SentryCore.captureException).toHaveBeenCalledWith(wrappedError, {
        mechanism: { handled: false, type: 'auto.queue.bullmq' },
      });
    });

    it('wraps string exceptions in an Error and captures via Sentry', () => {
      const { span, otelSpan } = createSpan();

      (span as any).recordException('Connection timed out');

      const wrappedError = new Error('Connection timed out');
      expect(otelSpan.recordException).toHaveBeenCalledWith(wrappedError);
      expect(SentryCore.captureException).toHaveBeenCalledWith(wrappedError, {
        mechanism: { handled: false, type: 'auto.queue.bullmq' },
      });
    });

    it('uses fallback message when non-Error exception has no message', () => {
      const { span, otelSpan } = createSpan();

      span.recordException({ code: 500 });

      const wrappedError = new Error('Unknown error');
      expect(otelSpan.recordException).toHaveBeenCalledWith(wrappedError);
      expect(SentryCore.captureException).toHaveBeenCalledWith(wrappedError, {
        mechanism: { handled: false, type: 'auto.queue.bullmq' },
      });
    });
  });

  describe('addEvent', () => {
    it('captures exception when event name is "job failed"', () => {
      const { span } = createSpan();

      span.addEvent('job failed', { 'bullmq.job.failed.reason': 'Connection refused' });

      expect(SentryCore.captureException).toHaveBeenCalledWith(new Error('Connection refused'), {
        mechanism: { handled: false, type: 'auto.queue.bullmq' },
      });
    });

    it('does not capture exception for other event names', () => {
      const { span } = createSpan();

      span.addEvent('job completed', { 'bullmq.job.result': '{"ok":true}' });

      expect(SentryCore.captureException).not.toHaveBeenCalled();
    });
  });

  it('returns context with span and scope from setSpanOnContext', () => {
    const { span, otelSpan } = createSpan();
    const inputContext = { existingKey: 'value' };

    const result = span.setSpanOnContext(inputContext) as Record<string, unknown>;

    expect(result.existingKey).toBe('value');
    expect(result.span).toBe(otelSpan);
    expect(result.scope).toBeDefined();
  });

  it('delegates end to the underlying OTel span', () => {
    const { span, otelSpan } = createSpan();

    span.end();

    expect(otelSpan.end).toHaveBeenCalledOnce();
  });
});

describe('SentryBullMQContextManager', () => {
  it('returns current active span and scope from active()', () => {
    const telemetry = new BullMQTelemetry();

    const context = telemetry.contextManager.active();

    expect(SentryCore.getActiveSpan).toHaveBeenCalledOnce();
    expect(SentryCore.getCurrentScope).toHaveBeenCalled();
    expect(context).toHaveProperty('span');
    expect(context).toHaveProperty('scope');
  });

  describe('with', () => {
    it('calls withActiveSpan inside withIsolationScope when context has a span', () => {
      const telemetry = new BullMQTelemetry();
      const fakeSpan = mockOtelSpan();
      const context = { span: fakeSpan, scope: mockScope() };
      const fn = vi.fn(() => 'result');

      const result = telemetry.contextManager.with(context as any, fn);

      expect(result).toBe('result');
      expect(SentryCore.withIsolationScope).toHaveBeenCalledOnce();
      expect(SentryCore.withActiveSpan).toHaveBeenCalledWith(fakeSpan, fn);
    });

    it('calls only withIsolationScope when context has no span', () => {
      const telemetry = new BullMQTelemetry();
      const context = { span: undefined, scope: mockScope() };
      const fn = vi.fn(() => 'result');

      telemetry.contextManager.with(context as any, fn);

      expect(SentryCore.withIsolationScope).toHaveBeenCalledOnce();
      expect(SentryCore.withActiveSpan).not.toHaveBeenCalled();
    });
  });

  describe('getMetadata', () => {
    it('returns sentry-trace header when context has a span', () => {
      const telemetry = new BullMQTelemetry();
      const fakeSpan = mockOtelSpan();
      const context = { span: fakeSpan, scope: mockScope() };

      const metadata = telemetry.contextManager.getMetadata(context as any);

      expect(SentryCore.spanToTraceHeader).toHaveBeenCalledWith(fakeSpan);
      expect(metadata).toBe('00-traceid-spanid-01');
    });

    it('returns empty string when context has no span', () => {
      const telemetry = new BullMQTelemetry();
      const context = { span: undefined, scope: mockScope() };

      const metadata = telemetry.contextManager.getMetadata(context as any);

      expect(metadata).toBe('');
      expect(SentryCore.spanToTraceHeader).not.toHaveBeenCalled();
    });
  });

  describe('fromMetadata', () => {
    it('parses sentry-trace header and attaches producerSpanContext', () => {
      const telemetry = new BullMQTelemetry();
      const fakeSpan = mockOtelSpan();
      const context = { span: fakeSpan, scope: mockScope() };

      const result = telemetry.contextManager.fromMetadata(
        context as any,
        'aabbccddaabbccddaabbccddaabbccdd-1122334455667788-1',
      );

      expect(result.span).toBe(fakeSpan);
      expect(result.scope).toBe(context.scope);
      expect(result.producerSpanContext).toEqual({
        traceId: 'aabbccddaabbccddaabbccddaabbccdd',
        spanId: '1122334455667788',
        sampled: true,
      });
    });

    it('returns the active context unchanged when metadata is empty', () => {
      const telemetry = new BullMQTelemetry();
      const context = { span: undefined, scope: mockScope() };

      const result = telemetry.contextManager.fromMetadata(context as any, '');

      expect(result).toBe(context);
    });

    it('returns the active context unchanged when metadata is invalid', () => {
      const telemetry = new BullMQTelemetry();
      const context = { span: undefined, scope: mockScope() };

      const result = telemetry.contextManager.fromMetadata(context as any, 'not-a-valid-header');

      expect(result).toBe(context);
    });
  });
});

describe('SentryBullMQMeter', () => {
  describe('counter', () => {
    it('delegates add to metrics.count with name and unit', () => {
      const telemetry = new BullMQTelemetry();
      const counter = telemetry.meter!.createCounter('bullmq.jobs.completed', { unit: '1' });

      counter.add(5, { 'queue.name': 'emails' });

      expect(SentryCore.metrics.count).toHaveBeenCalledWith('bullmq.jobs.completed', 5, {
        unit: '1',
        attributes: { 'queue.name': 'emails' },
      });
    });

    it('passes undefined attributes when none provided', () => {
      const telemetry = new BullMQTelemetry();
      const counter = telemetry.meter!.createCounter('bullmq.jobs.failed');

      counter.add(1);

      expect(SentryCore.metrics.count).toHaveBeenCalledWith('bullmq.jobs.failed', 1, {
        unit: undefined,
        attributes: undefined,
      });
    });
  });

  describe('histogram', () => {
    it('delegates record to metrics.distribution', () => {
      const telemetry = new BullMQTelemetry();
      const histogram = telemetry.meter!.createHistogram('bullmq.job.duration', { unit: 'ms' });

      histogram.record(142.5, { 'queue.name': 'notifications' });

      expect(SentryCore.metrics.distribution).toHaveBeenCalledWith('bullmq.job.duration', 142.5, {
        unit: 'ms',
        attributes: { 'queue.name': 'notifications' },
      });
    });
  });

  describe('gauge', () => {
    it('delegates record to metrics.gauge', () => {
      const telemetry = new BullMQTelemetry();
      const gauge = telemetry.meter!.createGauge!('bullmq.queue.size', { unit: '1' });

      gauge.record(37, { 'queue.name': 'reports' });

      expect(SentryCore.metrics.gauge).toHaveBeenCalledWith('bullmq.queue.size', 37, {
        unit: '1',
        attributes: { 'queue.name': 'reports' },
      });
    });
  });

  describe('attribute filtering', () => {
    it('filters out array attribute values', () => {
      const telemetry = new BullMQTelemetry();
      const counter = telemetry.meter!.createCounter('bullmq.jobs.completed');

      counter.add(1, {
        'queue.name': 'emails',
        tags: ['urgent', 'retry'],
        priority: 5,
        enabled: true,
      });

      expect(SentryCore.metrics.count).toHaveBeenCalledWith('bullmq.jobs.completed', 1, {
        unit: undefined,
        attributes: {
          'queue.name': 'emails',
          priority: 5,
          enabled: true,
        },
      });
    });

    it('returns empty object when all attributes are arrays', () => {
      const telemetry = new BullMQTelemetry();
      const counter = telemetry.meter!.createCounter('bullmq.jobs.completed');

      counter.add(1, { tags: ['a', 'b'] });

      expect(SentryCore.metrics.count).toHaveBeenCalledWith('bullmq.jobs.completed', 1, {
        unit: undefined,
        attributes: {},
      });
    });
  });
});
