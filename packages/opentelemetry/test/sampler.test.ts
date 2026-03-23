import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_REQUEST_METHOD } from '@opentelemetry/semantic-conventions';
import { generateSpanId, generateTraceId } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENTRY_TRACE_STATE_IGNORED, SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING } from '../src/constants';
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

  it('returns NOT_RECORD for root span matching ignoreSpans string pattern', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ignoreSpans: ['GET /health'] }));
    const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'GET /health';
    const spanKind = SpanKind.SERVER;
    const spanAttributes = {};

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
    expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
    expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
  });

  it('returns NOT_RECORD for root span matching ignoreSpans regex pattern', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ignoreSpans: [/health/] }));
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'GET /healthcheck';
    const spanKind = SpanKind.SERVER;
    const spanAttributes = {};

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
    expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it('returns NOT_RECORD for root span matching ignoreSpans IgnoreSpanFilter with name and op', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({
        tracesSampleRate: 1,
        ignoreSpans: [{ name: 'GET /health', op: 'http.server' }],
      }),
    );
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'GET /health';
    const spanKind = SpanKind.SERVER;
    const spanAttributes = { [ATTR_HTTP_REQUEST_METHOD]: 'GET' };

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
    expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
  });

  it('does not ignore root span that does not match ignoreSpans', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ignoreSpans: ['GET /health'] }));
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = generateTraceId();
    const spanName = 'GET /users';
    const spanKind = SpanKind.SERVER;
    const spanAttributes = {};

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
    expect(actual.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('returns NOT_RECORD with sentry.ignored traceState for child span matching ignoreSpans', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({ tracesSampleRate: 1, ignoreSpans: ['middleware - expressInit'] }),
    );
    const sampler = new SentrySampler(client);

    const traceId = generateTraceId();
    const ctx = trace.setSpanContext(context.active(), {
      traceId,
      spanId: generateSpanId(),
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    });

    const actual = sampler.shouldSample(ctx, traceId, 'middleware - expressInit', SpanKind.INTERNAL, {}, undefined);

    expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
    expect(actual.traceState?.get(SENTRY_TRACE_STATE_IGNORED)).toBe('1');
  });

  it('does not set sentry.ignored for child span not matching ignoreSpans', () => {
    const client = new TestClient(
      getDefaultTestClientOptions({ tracesSampleRate: 1, ignoreSpans: ['middleware - expressInit'] }),
    );
    const sampler = new SentrySampler(client);

    const traceId = generateTraceId();
    const ctx = trace.setSpanContext(context.active(), {
      traceId,
      spanId: generateSpanId(),
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    });

    const actual = sampler.shouldSample(ctx, traceId, 'db.query SELECT 1', SpanKind.CLIENT, {}, undefined);

    expect(actual.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    expect(actual.traceState?.get(SENTRY_TRACE_STATE_IGNORED)).toBeUndefined();
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
