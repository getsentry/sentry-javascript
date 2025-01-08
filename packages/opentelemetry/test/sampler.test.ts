import { SpanKind, context } from '@opentelemetry/api';
import { TraceState } from '@opentelemetry/core';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_REQUEST_METHOD } from '@opentelemetry/semantic-conventions';
import { SentrySampler } from '../src/sampler';
import { TestClient, getDefaultTestClientOptions } from './helpers/TestClient';
import { cleanupOtel } from './helpers/mockSdkInit';

describe('SentrySampler', () => {
  afterEach(() => {
    cleanupOtel();
  });

  it('works with tracesSampleRate=0', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 0 }));
    const spyOnDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = '1234567890123456';
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual({
      decision: SamplingDecision.NOT_RECORD,
      attributes: { 'sentry.sample_rate': 0 },
      traceState: new TraceState().set('sentry.sampled_not_recording', '1'),
    });
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(1);
    expect(spyOnDroppedEvent).toHaveBeenCalledWith('sample_rate', 'transaction');

    spyOnDroppedEvent.mockReset();
  });

  it('works with tracesSampleRate=1', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    const spyOnDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = '1234567890123456';
    const spanName = 'test';
    const spanKind = SpanKind.INTERNAL;
    const spanAttributes = {};
    const links = undefined;

    const actual = sampler.shouldSample(ctx, traceId, spanName, spanKind, spanAttributes, links);
    expect(actual).toEqual({
      decision: SamplingDecision.RECORD_AND_SAMPLED,
      attributes: { 'sentry.sample_rate': 1 },
      traceState: new TraceState(),
    });
    expect(spyOnDroppedEvent).toHaveBeenCalledTimes(0);

    spyOnDroppedEvent.mockReset();
  });

  it('works with traceSampleRate=undefined', () => {
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: undefined }));
    const spyOnDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = '1234567890123456';
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
    const spyOnDroppedEvent = jest.spyOn(client, 'recordDroppedEvent');
    const sampler = new SentrySampler(client);

    const ctx = context.active();
    const traceId = '1234567890123456';
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
