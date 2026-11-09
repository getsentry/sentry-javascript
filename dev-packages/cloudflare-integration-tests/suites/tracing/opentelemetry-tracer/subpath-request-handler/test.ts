import { HTTP_SERVER } from '@sentry/conventions/op';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../../../spanUtils';

it('does not capture spans emitted through @opentelemetry/api inside wrapRequestHandler from the /request subpath', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      // Only the request's segment span. The OpenTelemetry span is not captured.
      const spans = getSpansFromEnvelope(envelope);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.is_segment).toBe(true);
      expect(spans[0]?.name).toBe('GET /');
      expect(getSpanOp(spans[0]!)).toBe(HTTP_SERVER);
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
