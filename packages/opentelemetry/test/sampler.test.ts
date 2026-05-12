import { context, SpanKind, trace, TraceFlags } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_REQUEST_METHOD } from '@opentelemetry/semantic-conventions';
import { generateSpanId, generateTraceId } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SENTRY_TRACE_STATE_CHILD_IGNORED,
  SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING,
  SENTRY_TRACE_STATE_SEGMENT_IGNORED,
} from '../src/constants';
import { SentrySampler } from '../src/sampler';
import { cleanupOtel } from './helpers/mockSdkInit';
import { getDefaultTestClientOptions, TestClient } from './helpers/TestClient';

describe('SentrySampler', () => {
  afterEach(async () => {
    await cleanupOtel();
  });

  it('samples negatively with tracesSampleRate=0 and records a sample_rate outcome', () => {
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
    expect(actual.traceState?.get('sentry-sampled_not_recording')).toBe('1');
    expect(actual.traceState?.get('sentry-sample_rand')).toEqual(expect.any(String));
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
    expect(spyOnDroppedEvent).toHaveBeenCalledWith('sample_rate', 'transaction');

    spyOnDroppedEvent.mockReset();
  });

  it('samples a child span negatively based on tracesSampleRate=0', () => {
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
    // Does not record a client outcome for child spans when in static trace lifecycle (i.e. transactions)
    expect(spyOnDroppedEvent).not.toHaveBeenCalled();

    spyOnDroppedEvent.mockReset();
  });

  it('samples positively with tracesSampleRate=1', () => {
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

  it('defers sampling with traceSampleRate=undefined', () => {
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

  it('ignores local http client root spans and records no_parent_span client report', () => {
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
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
    expect(spyOnDroppedEvent).toHaveBeenCalledWith('no_parent_span', 'span');

    spyOnDroppedEvent.mockReset();
  });

  describe('when span streaming is enabled', () => {
    /*
      For span streaming, we use the Sampler to "sample" spans based on `ignoreSpans`. In reality though,
      we don't apply sampling options (rate, traces_sampler) but just filter spans via `ignoreSpans`.
      The sampler allows us to modify context and tracestate to correctly propagate filtering decisions
      to potential child spans (e.g. when a segment is ignored, so that all its children are also ignored).
    */
    it('returns NOT_RECORD for root span matching ignoreSpans string pattern', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream', ignoreSpans: ['GET /health'] }),
      );
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
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
    });

    it('returns NOT_RECORD for root span matching ignoreSpans regex pattern', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream', ignoreSpans: [/health/] }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const ctx = context.active();
      const traceId = generateTraceId();
      const spanName = 'GET /healthcheck';
      const spanKind = SpanKind.SERVER;
      const spanAttributes = {};

      const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
      expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
    });

    it('returns NOT_RECORD for root span matching ignoreSpans IgnoreSpanFilter with name and op', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          ignoreSpans: [{ name: 'GET /health', op: 'http.server' }],
        }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const ctx = context.active();
      const traceId = generateTraceId();
      const spanName = 'GET /health';
      const spanKind = SpanKind.SERVER;
      const spanAttributes = { [ATTR_HTTP_REQUEST_METHOD]: 'GET' };

      const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
      expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
    });

    it("doesn't ignore root span that does not match ignoreSpans", () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream', ignoreSpans: ['GET /health'] }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const ctx = context.active();
      const traceId = generateTraceId();
      const spanName = 'GET /users';
      const spanKind = SpanKind.SERVER;
      const spanAttributes = {};

      const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
      expect(actual.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(spyOnDroppedEvent).not.toHaveBeenCalled();
    });

    it('returns NOT_RECORD with sentry.ignored traceState for child span matching ignoreSpans', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          ignoreSpans: ['middleware - expressInit'],
        }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
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
      expect(actual.traceState?.get(SENTRY_TRACE_STATE_CHILD_IGNORED)).toBe('1');
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
    });

    it("doesn't set SENTRY_TRACE_STATE_CHILD_IGNORED for child span not matching ignoreSpans", () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1,
          traceLifecycle: 'stream',
          ignoreSpans: ['middleware - expressInit'],
        }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
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
      expect(actual.traceState?.get(SENTRY_TRACE_STATE_CHILD_IGNORED)).toBeUndefined();
      expect(spyOnDroppedEvent).not.toHaveBeenCalled();
    });

    it('sets sentry.segment_ignored traceState for a segment span matching ignoreSpans', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream', ignoreSpans: ['GET /health'] }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const ctx = context.active();
      const traceId = generateTraceId();
      const spanName = 'GET /health';
      const spanKind = SpanKind.SERVER;
      const spanAttributes = {};

      const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
      expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
      expect(actual.traceState?.get(SENTRY_TRACE_STATE_SEGMENT_IGNORED)).toBe('1');
      expect(actual.traceState?.get(SENTRY_TRACE_STATE_CHILD_IGNORED)).toBeUndefined();
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
    });

    it('records ignored outcome for child span of ignored segment', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream', ignoreSpans: ['GET /health'] }),
      );
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const traceId = generateTraceId();
      const ctx = trace.setSpanContext(context.active(), {
        spanId: generateSpanId(),
        traceId,
        traceFlags: 0,
        traceState: new TraceState()
          .set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1')
          .set(SENTRY_TRACE_STATE_SEGMENT_IGNORED, '1'),
      });

      const actual = sampler.shouldSample(ctx, traceId, 'db.query SELECT 1', SpanKind.CLIENT, {}, undefined);
      expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
      expect(spyOnDroppedEvent).toHaveBeenCalledOnce();
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('ignored', 'span');
    });

    it('records sample_rate outcome for child span of negatively sampled segment', () => {
      // For span streaming, we also record a sample_rate outcome for a child span of a negatively sampled trace.

      const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 0, traceLifecycle: 'stream' }));
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const traceId = generateTraceId();
      const ctx = trace.setSpanContext(context.active(), {
        spanId: generateSpanId(),
        traceId,
        traceFlags: 0,
        traceState: new TraceState().set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1'),
      });

      const actual = sampler.shouldSample(ctx, traceId, 'db.query SELECT 1', SpanKind.CLIENT, {}, undefined);
      expect(actual.decision).toBe(SamplingDecision.NOT_RECORD);
      expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
      expect(spyOnDroppedEvent).toHaveBeenCalledWith('sample_rate', 'span');
    });

    it('always emits streamed http.client spans without a local parent', () => {
      const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, traceLifecycle: 'stream' }));
      const spyOnDroppedEvent = vi.spyOn(client, 'recordDroppedEvent');
      const sampler = new SentrySampler(client);

      const ctx = context.active();
      const traceId = generateTraceId();
      const spanName = 'GET http://example.com/api';
      const spanKind = SpanKind.CLIENT;
      const spanAttributes = {
        [ATTR_HTTP_REQUEST_METHOD]: 'GET',
      };

      const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, undefined);
      expect(actual.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
      expect(spyOnDroppedEvent).not.toHaveBeenCalled();
    });
  });
});
