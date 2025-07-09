import { context, SpanKind, trace } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_REQUEST_METHOD } from '@opentelemetry/semantic-conventions';
import { generateSpanId, generateTraceId } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from '../src/constants';
import { SentrySampler } from '../src/sampler';
import { cleanupOtel } from './helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from './helpers/TestClient';

describe('SentrySampler', () => {
  afterEach(async () => {
    await cleanupOtel();
  });

  it('works with tracesSampleRate=0', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 0 }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual(
      expect.objectContaining({
        decision: SamplingDecision.NOT_RECORD,
        attributes: { 'sentry.sample_rate': 0 },
      }),
    );
    expect(actual.traceState?.get('sentry.sampled_not_recording')).toBe('1');
    expect(actual.traceState?.get('sentry.sample_rand')).toEqual(expect.any(String));
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
    expect(spyOnDroppedEvent).toHaveBeenCalledWith('sample_rate', 'transaction');

    spyOnDroppedEvent.mockReset();
  });

  it('works with tracesSampleRate=0 & for a child span', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 0 }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const traceId = generateTraceId();
    const ctx = trace.setSpanContext(context.active(), {
      spanId: generateSpanId(),
      traceId,
      traceFlags: 0,
      traceState: new TraceState().set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
    });
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual({
      decision: SamplingDecision.NOT_RECORD,
      traceState: new TraceState().set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
    });
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(0);

    spyOnDroppedEvent.mockReset();
  });

  it('works with tracesSampleRate=1', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual(
      expect.objectContaining({
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: { 'sentry.sample_rate': 1 },
      }),
    );
    expect(actual.traceState?.constructor.name).toBe('TraceState');
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(0);

    spyOnDroppedEvent.mockReset();
  });

  it('works with traceSampleRate=undefined', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: undefined }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual({
      decision: SamplingDecision.NOT_RECORD,
      traceState: new TraceState(),
    });
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(0);

    spyOnDroppedEvent.mockReset();
  });

  it('ignores local http client root spans', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 0 }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'test';
    const spanKind = SpanKind.CLIENT;
    const spanAttributes = {
      [ATTR_HTTP_REQUEST_METHOD]: 'GET',
    };
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual({
      decision: SamplingDecision.NOT_RECORD,
      traceState: new TraceState(),
    });
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(0);

    spyOnDroppedEvent.mockReset();
  });
});
