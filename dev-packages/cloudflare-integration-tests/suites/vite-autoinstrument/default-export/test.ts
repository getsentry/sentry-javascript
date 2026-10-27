import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../spanUtils';

// The worker entry is a plain, unwrapped `export default {...}`. The runner
// detects `vite.config.mts`, runs `vite build`, and serves the generated output
// — so this span only arrives if the build-time transform wrapped the default
// export with `withSentry`.
it('auto-instruments a plain default-export handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // `/hello` is a raw URL, so the streamed segment name keeps the method only.
      expect(segmentSpan?.name).toBe('GET');
      expect(segmentSpan?.attributes['url.path']).toEqual({ type: 'string', value: '/hello' });
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
    })
    .start(signal);

  await runner.makeRequest('get', '/hello');
  await runner.completed();
});
