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
    startNewTrace: vi.fn(fn => fn()),
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
  vi.clearAllMocks();
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
      { name: 'add myQueue', expectedOp: 'queue.publish', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addBulk myQueue', expectedOp: 'queue.publish', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addFlow myQueue', expectedOp: 'queue.publish', expectedOrigin: 'auto.queue.bullmq.producer' },
      { name: 'addBulkFlows myQueue', expectedOp: 'queue.publish', expectedOrigin: 'auto.queue.bullmq.producer' },
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
          'sentry.op': expectedOp,
          'sentry.origin': expectedOrigin,
          'messaging.system': 'bullmq',
        },
        onlyIfParent: expectedOp === 'queue',
      });
    });

    it('maps "process myQueue" to op=queue.process and origin=auto.queue.bullmq.consumer', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('process myQueue');

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith({
        name: 'process myQueue',
        attributes: {
          'sentry.op': 'queue.process',
          'sentry.origin': 'auto.queue.bullmq.consumer',
          'messaging.system': 'bullmq',
        },
      });
    });

    it('merges attributes from SpanOptions and adds the matching messaging attributes', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('add emails', {
        attributes: { 'bullmq.queue.name': 'emails' },
      });

      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'bullmq.queue.name': 'emails',
            'messaging.destination.name': 'emails',
          }),
        }),
      );
    });

    it('starts each queue.process span in a new trace', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('process notifications');

      expect(SentryCore.startNewTrace).toHaveBeenCalledWith(expect.any(Function));
    });

    it('starts queue.publish spans as children of the active span', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('add notifications');

      expect(SentryCore.startNewTrace).not.toHaveBeenCalled();
      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ onlyIfParent: false }));
    });

    it('only starts spans for internal operations when there is a parent span', () => {
      const telemetry = new BullMQTelemetry();

      telemetry.tracer.startSpan('moveStalledJobsToWait notifications');

      expect(SentryCore.startNewTrace).not.toHaveBeenCalled();
      expect(SentryCore.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ onlyIfParent: true }));
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
      expect(span.setAttribute).not.toHaveBeenCalled();
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

    span.setAttribute('bullmq.job.name', 'welcome-email');

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({ 'bullmq.job.name': 'welcome-email' });
  });

  it('delegates setAttributes to the underlying OTel span', () => {
    const { span, otelSpan } = createSpan();

    span.setAttributes({ 'bullmq.job.name': 'welcome-email', 'bullmq.worker.name': 'mailer' });

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      'bullmq.job.name': 'welcome-email',
      'bullmq.worker.name': 'mailer',
    });
  });

  it('adds messaging attributes for the BullMQ queue name, job id and attempts', () => {
    const { span, otelSpan } = createSpan();

    span.setAttributes({ 'bullmq.queue.name': 'emails', 'bullmq.job.id': '42', 'bullmq.job.attempts.made': 3 });

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      'bullmq.queue.name': 'emails',
      'bullmq.job.id': '42',
      'bullmq.job.attempts.made': 3,
      'messaging.destination.name': 'emails',
      'messaging.message.id': '42',
      'messaging.message.retry.count': 2,
    });
  });

  it('adds the messaging destination when BullMQ sets the queue name with setAttribute', () => {
    const { span, otelSpan } = createSpan();

    span.setAttribute('bullmq.queue.name', 'emails');

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      'bullmq.queue.name': 'emails',
      'messaging.destination.name': 'emails',
    });
  });

  it('sets a retry count of 0 for the first attempt', () => {
    const { span, otelSpan } = createSpan();

    span.setAttributes({ 'bullmq.job.attempts.made': 1 });

    expect(otelSpan.setAttributes).toHaveBeenCalledWith({
      'bullmq.job.attempts.made': 1,
      'messaging.message.retry.count': 0,
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
    it('records Error instances on the OTel span without capturing them', () => {
      const { span, otelSpan } = createSpan();
      const error = new Error('Redis connection refused');

      span.recordException(error);

      expect(otelSpan.recordException).toHaveBeenCalledWith(error);
      expect(SentryCore.captureException).not.toHaveBeenCalled();
    });

    it('wraps non-Error exception objects in an Error', () => {
      const { span, otelSpan } = createSpan();

      span.recordException({ code: 503, message: 'Service unavailable' });

      expect(otelSpan.recordException).toHaveBeenCalledWith(new Error('Service unavailable'));
      expect(SentryCore.captureException).not.toHaveBeenCalled();
    });

    it('wraps string exceptions in an Error', () => {
      const { span, otelSpan } = createSpan();

      (span as any).recordException('Connection timed out');

      expect(otelSpan.recordException).toHaveBeenCalledWith(new Error('Connection timed out'));
      expect(SentryCore.captureException).not.toHaveBeenCalled();
    });

    it('uses fallback message when non-Error exception has no message', () => {
      const { span, otelSpan } = createSpan();

      span.recordException({ code: 500 });

      expect(otelSpan.recordException).toHaveBeenCalledWith(new Error('Unknown error'));
      expect(SentryCore.captureException).not.toHaveBeenCalled();
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

    it('clears the active span inside withIsolationScope when context has no span', () => {
      const telemetry = new BullMQTelemetry();
      const context = { span: undefined, scope: mockScope() };
      const fn = vi.fn(() => 'result');

      const result = telemetry.contextManager.with(context as any, fn);

      expect(result).toBe('result');
      expect(SentryCore.withIsolationScope).toHaveBeenCalledOnce();
      expect(SentryCore.withActiveSpan).toHaveBeenCalledWith(null, fn);
    });
  });

  describe('root', () => {
    it('returns a context without a span that runs callbacks without an active span', () => {
      const telemetry = new BullMQTelemetry();
      const fn = vi.fn(() => 'result');

      const context = telemetry.contextManager.root!();
      const result = telemetry.contextManager.with(context, fn);

      expect(context.span).toBeUndefined();
      expect(result).toBe('result');
      expect(SentryCore.withActiveSpan).toHaveBeenCalledWith(null, fn);
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
