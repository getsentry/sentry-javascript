import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

function expectServerSpanAt(path: string) {
  return (envelope: Parameters<typeof getSpansFromEnvelope>[0]) => {
    const serverSpans = getSpansFromEnvelope(envelope).filter(span => getSpanOp(span) === 'http.server');

    expect(serverSpans.map(span => span.attributes['url.path']?.value)).toEqual([path]);
  };
}

it('drops the server span of managed tunnel requests', async ({ signal }) => {
  // Envelopes are expected in order, so a span of the tunnel request would arrive before the last one.
  const runner = createRunner(__dirname)
    .expect(expectServerSpanAt('/tunnel-path'))
    .expect(expectServerSpanAt('/after-tunnel'))
    .start(signal);

  const tunnelPath = await runner.makeRequest<string>('get', '/tunnel-path');
  expect(await runner.makeRequest<string>('post', tunnelPath!, { data: 'envelope' })).toBe('app');
  await runner.makeRequest('get', '/after-tunnel');

  await runner.completed();
});
