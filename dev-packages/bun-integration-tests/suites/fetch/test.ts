import { afterAll, expect, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../../node-integration-tests/utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

test('creates an http.client span for outgoing fetch requests', async () => {
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .expect({
      span: container => {
        const segmentSpan = container.items.find(span => span.is_segment);
        expect(segmentSpan).toMatchObject({
          // `Bun.serve` without `routes` has no parameterized route, so the streamed segment is
          // named after the method only; the path lives in `url.path`.
          name: 'GET',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'http.server', type: 'string' },
            'url.path': { value: '/outgoing-fetch', type: 'string' },
          }),
        });

        const httpClientSpan = container.items.find(span => span.attributes['sentry.op']?.value === 'http.client');

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
      },
    })
    .start();

  await runner.makeRequest('get', '/outgoing-fetch');
  await runner.completed();
});

test('propagates sentry-trace and baggage headers to allowed outgoing fetch requests', async () => {
  const runner = createRunner(__dirname, 'index.ts').withMockSentryServer().start();

  const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', '/outgoing-fetch');

  const traceId = response?.headers['sentry-trace']?.split('-')[0];

  expect(response?.headers['sentry-trace']).toMatch(/^[\da-f]{32}-[\da-f]{16}-1$/);
  expect(response?.headers.baggage).toContain('sentry-environment=production');
  expect(response?.headers.baggage).toContain(`sentry-trace_id=${traceId}`);
});

test('does not propagate headers to outgoing fetch requests outside tracePropagationTargets', async () => {
  const runner = createRunner(__dirname, 'index.ts').withMockSentryServer().start();

  const response = await runner.makeRequest<{ headers: Record<string, string> }>('get', '/outgoing-fetch-disallowed');

  expect(response?.headers).toBeDefined();
  expect(response?.headers['sentry-trace']).toBeUndefined();
  expect(response?.headers.baggage).toBeUndefined();
});

test('records a breadcrumb for outgoing fetch requests', async () => {
  // Streamed spans carry no breadcrumbs, so the breadcrumb is asserted on an error
  // captured right after the fetch instead.
  const runner = createRunner(__dirname, 'index.ts')
    .withMockSentryServer()
    .ignore('span')
    .expect({
      event: event => {
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
      },
    })
    .start();

  await runner.makeRequest('get', '/outgoing-fetch-error');
  await runner.completed();
});
