import type { SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { eventEnvelope, SHORT_UUID_MATCHER, UUID_MATCHER } from '../../expect';
import { createRunner } from '../../runner';

it('Hono app captures parametrized errors (Hono SDK on Bun)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('span');

      const segmentSpan = (itemPayload as SerializedStreamedSpanContainer).items.find(span => span.is_segment);

      expect(segmentSpan).toMatchObject({
        name: 'GET /error/:param',
        is_segment: true,
        span_id: expect.any(String),
        trace_id: expect.any(String),
        status: 'error',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'http.server', type: 'string' },
          'sentry.origin': { value: 'auto.http.bun.serve', type: 'string' },
          'sentry.segment.name.source': { value: 'route', type: 'string' },
          'http.route': { value: '/error/:param', type: 'string' },
          'http.request.method': { value: 'GET', type: 'string' },
          'http.response.status_code': { value: 500, type: 'integer' },
          'url.path': { value: '/error/param-123', type: 'string' },
        }),
      });
    })

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
          user: { ip_address: expect.any(String) },
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
        { sdk: 'hono', includeSampleRand: true, includeTransaction: true },
      ),
    )
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/error/param-123', { expectError: true });
  await runner.completed();
});

it('Hono app captures parametrized route names on Bun', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('span');

      const segmentSpan = (itemPayload as SerializedStreamedSpanContainer).items.find(span => span.is_segment);

      expect(segmentSpan).toMatchObject({
        name: 'GET /hello/:name',
        is_segment: true,
        span_id: SHORT_UUID_MATCHER,
        trace_id: UUID_MATCHER,
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'http.server', type: 'string' },
          'sentry.origin': { value: 'auto.http.bun.serve', type: 'string' },
          'sentry.segment.name.source': { value: 'route', type: 'string' },
          'http.route': { value: '/hello/:name', type: 'string' },
          'http.request.method': { value: 'GET', type: 'string' },
          'url.path': { value: '/hello/world', type: 'string' },
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/hello/world');
  await runner.completed();
});
