import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';
import { getSpanOp, getSpansFromEnvelope } from '../../spanUtils';

it('Hono app captures parametrized errors (Hono SDK)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          transaction: 'GET /error/:param',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Test error from Hono app',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.hono.context_error', handled: false },
              },
            ],
          },
          request: {
            cookies: {},
            headers: expect.any(Object),
            method: 'GET',
            url: expect.stringContaining('/error/param-123'),
          },
          breadcrumbs: [
            {
              timestamp: expect.any(Number),
              category: 'console',
              level: 'error',
              message: 'Error: Test error from Hono app',
              data: expect.objectContaining({
                logger: 'console',
                arguments: [{ message: 'Test error from Hono app', name: 'Error', stack: expect.any(String) }],
              }),
            },
          ],
        },
        { includeSamplingFields: true, includeSampleRand: true, sdk: 'hono' },
      ),
    )
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      // The Hono route is a parametrized pattern, so the streamed segment keeps the full name.
      expect(segmentSpan?.name).toBe('GET /error/:param');
      // Span v2 keeps the coarse `error` status on the span and the specific one as an attribute.
      expect(segmentSpan?.status).toBe('error');
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.status.message': { type: 'string', value: 'internal_error' },
          'sentry.origin': { type: 'string', value: 'auto.http.cloudflare' },
          'sentry.segment.name.source': { type: 'string', value: 'route' },
          'http.request.method': { type: 'string', value: 'GET' },
          'url.path': { type: 'string', value: '/error/param-123' },
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/error/param-123', { expectError: true });
  await runner.completed();
});

it('Hono app captures parametrized names', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const segmentSpan = getSpansFromEnvelope(envelope).find(span => span.is_segment);

      expect(segmentSpan?.name).toBe('GET /hello/:name');
      expect(segmentSpan?.status).toBe('ok');
      expect(getSpanOp(segmentSpan!)).toBe('http.server');
      expect(segmentSpan?.attributes).toEqual(
        expect.objectContaining({
          'sentry.origin': { type: 'string', value: 'auto.http.cloudflare' },
          'sentry.segment.name.source': { type: 'string', value: 'route' },
          'http.request.method': { type: 'string', value: 'GET' },
          'url.path': { type: 'string', value: '/hello/:name' },
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/hello/:name', { expectError: false });
  await runner.completed();
});
