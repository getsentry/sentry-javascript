import type { Envelope, Event, SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function getSpans(envelope: Envelope): SerializedStreamedSpan[] {
  return (envelope[1][0][1] as SerializedStreamedSpanContainer).items;
}

it('creates an http.client span for outgoing fetch requests', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpans(envelope);

      const segmentSpan = spans.find(span => span.is_segment);
      expect(segmentSpan).toMatchObject({
        // `Bun.serve` without `routes` has no parameterized route, so the streamed segment is
        // named after the method only; the path lives in `url.path`.
        name: 'GET',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'http.server', type: 'string' },
          'url.path': { value: '/outgoing-fetch', type: 'string' },
        }),
      });

      const httpClientSpan = spans.find(span => span.attributes['sentry.op']?.value === 'http.client');

      expect(httpClientSpan).toBeDefined();
      expect(httpClientSpan).toMatchObject({
        name: 'GET localhost',
        parent_span_id: segmentSpan!.span_id,
        attributes: expect.objectContaining({
          'sentry.op': { value: 'http.client', type: 'string' },
          'sentry.origin': { value: 'auto.http.fetch', type: 'string' },
          'http.request.method': { value: 'GET', type: 'string' },
          type: { value: 'fetch', type: 'string' },
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/outgoing-fetch');
  await runner.completed();
});

it('propagates sentry-trace and baggage headers to allowed outgoing fetch requests', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', '/outgoing-fetch');

  const traceId = response?.headers['sentry-trace']?.split('-')[0];

  expect(response?.headers['sentry-trace']).toMatch(/^[\da-f]{32}-[\da-f]{16}-1$/);
  expect(response?.headers.baggage).toContain('sentry-environment=production');
  expect(response?.headers.baggage).toContain(`sentry-trace_id=${traceId}`);
});

it('does not propagate headers to outgoing fetch requests outside tracePropagationTargets', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', '/outgoing-fetch-disallowed');

  expect(response?.headers['sentry-trace']).toBeUndefined();
  expect(response?.headers.baggage).toBeUndefined();
});

it('records a breadcrumb for outgoing fetch requests', async ({ signal }) => {
  // Streamed spans carry no breadcrumbs, so the breadcrumb is asserted on an error
  // captured right after the fetch instead.
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, event] = envelopeItems[0] as [{ type: string }, Event];

      expect(itemHeader.type).toBe('event');
      expect(event.exception?.values?.[0]?.value).toBe('fetch done');

      expect(event.breadcrumbs).toContainEqual(
        expect.objectContaining({
          category: 'fetch',
          type: 'http',
          data: expect.objectContaining({
            method: 'GET',
            status_code: 200,
            url: expect.stringMatching(/\/allowed$/),
          }),
        }),
      );
    })
    .ignore('span')
    .start(signal);

  await runner.makeRequest('get', '/outgoing-fetch-error');
  await runner.completed();
});
