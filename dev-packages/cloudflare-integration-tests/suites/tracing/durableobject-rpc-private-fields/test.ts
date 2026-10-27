import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// Regression for #23040. A Durable Object using native private fields must stay functional when
// instrumented with Sentry. Native RPC dispatch (Durable Object facets,
// the Agents SDK bootstrap) invokes prototype methods with the stored instance as the receiver,
// so the instrumented instance must not be a Proxy: a Proxy does not carry the private-field
// brand and `this.#field` throws "Cannot read private member".
it('keeps native private fields working when a prototype method is invoked with the instance as receiver', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('bootstrap');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // `/prototype-dispatch` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/prototype-dispatch' });
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/prototype-dispatch');
  expect(response).toBe('agent-1');

  await runner.completed();
});

it('propagates trace and preserves the result for a regular RPC method call', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('setName');
      expect(getSpanOp(segmentSpan!)).toBe('rpc');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({
        type: 'string',
        value: 'auto.faas.cloudflare.durable_object',
      });
    })
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/rpc/set-name' });
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
    })
    .unordered()
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/rpc/set-name');
  expect(response).toBe('agent-2');

  await runner.completed();
});
