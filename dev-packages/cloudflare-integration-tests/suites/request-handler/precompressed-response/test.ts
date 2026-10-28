import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

it('does not compress a response with `encodeBody: manual` a second time', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/' });
    })
    .start(signal);

  const body = await runner.makeRequest<string>('get', '/', { headers: { 'accept-encoding': 'gzip' } });
  expect(body).toBe('precompressed');

  await runner.completed();
});
