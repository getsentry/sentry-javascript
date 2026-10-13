import { expect, it } from 'vitest';
import type { Envelope, SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('propagates trace over RPC when the binding casing differs from rpcTracePropagationBindings', async ({ signal }) => {
  const segmentSpansByName = new Map<string, SerializedStreamedSpan>();

  const collect = (envelope: Envelope): void => {
    const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
    expect(segmentSpan).toBeDefined();
    segmentSpansByName.set(segmentSpan!.name, segmentSpan!);
  };

  const runner = createRunner(__dirname)
    .expect(collect)
    .expect(collect)
    .expect(collect)
    .expect(collect)
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/all');
  expect(response).toBe('Hello, World!,alpha,beta');

  await runner.completed();

  // `/rpc/all` is a raw URL, so the streamed segment name keeps the method only.
  const worker = segmentSpansByName.get('GET');
  expect(getSpanOp(worker!)).toBe('http.server');
  expect(worker?.attributes['url.path']).toEqual({ type: 'string', value: '/rpc/all' });

  // `sayHello` comes from the string target, `alpha` and `beta` from the regex target. `beta` is the
  // one a stateful `g` regex would miss, because `alpha` already advanced its `lastIndex`.
  for (const methodName of ['sayHello', 'alpha', 'beta']) {
    const durableObject = segmentSpansByName.get(methodName);

    expect(getSpanOp(durableObject!)).toBe('rpc');
    expect(durableObject?.trace_id).toBe(worker?.trace_id);
    expect(durableObject?.parent_span_id).toBe(worker?.span_id);
  }
});
