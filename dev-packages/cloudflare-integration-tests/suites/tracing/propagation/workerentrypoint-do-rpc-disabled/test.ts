import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('does not trace an RPC method call when rpcTracePropagationBindings is empty (WorkerEntrypoint)', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/rpc/hello' });
    })
    // Ordered: a `sayHello` span from the receiver would arrive here and fail this expectation.
    // Without the trailing Sentry argument the receiver never traces the call.
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/sentinel' });
    })
    .start(signal);

  expect(await runner.makeRequest<string>('get', '/rpc/hello')).toBe('Hello, World!');
  expect(await runner.makeRequest<string>('get', '/sentinel')).toBe('Sentinel');

  await runner.completed();
});
