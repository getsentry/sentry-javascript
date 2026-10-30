import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

function expectServerSpanAt(path: string) {
  return (envelope: Parameters<typeof getSpansFromEnvelope>[0]) => {
    const serverSpans = getSpansFromEnvelope(envelope).filter(span => getSpanOp(span) === 'http.server');

    expect(serverSpans.map(span => span.attributes['url.path']?.value)).toEqual([path]);
  };
}

it('answers managed tunnel requests before the app, without a server span', async ({ signal }) => {
  // Envelopes are expected in order, so a span of the tunnel request would arrive before the last one.
  const runner = createRunner(__dirname)
    .expect(expectServerSpanAt('/tunnel-path'))
    .expect(expectServerSpanAt('/after-tunnel'))
    .start(signal);

  const tunnelPath = await runner.makeRequest<string>('get', '/tunnel-path');
  // The tunnel rejects the body as an envelope. The app would have answered with a 200.
  await runner.makeRequest('post', tunnelPath!, { data: 'envelope', expectError: true });
  await runner.makeRequest('get', '/after-tunnel');

  await runner.completed();
});
