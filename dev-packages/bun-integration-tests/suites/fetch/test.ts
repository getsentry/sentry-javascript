import type { Envelope, TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function getTransaction(envelope: Envelope): TransactionEvent {
  return envelope[1][0][1] as TransactionEvent;
}

it('creates an http.client span for outgoing fetch requests', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transaction = getTransaction(envelope);

      expect(transaction.transaction).toBe('GET /outgoing-fetch');

      const httpClientSpan = transaction.spans?.find(span => span.op === 'http.client');

      expect(httpClientSpan).toBeDefined();
      expect(httpClientSpan).toMatchObject({
        op: 'http.client',
        origin: 'auto.http.fetch',
        description: expect.stringMatching(/^GET http:\/\/localhost:\d+\/allowed$/),
        data: expect.objectContaining({
          'http.method': 'GET',
          type: 'fetch',
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
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transaction = getTransaction(envelope);

      const fetchBreadcrumb = transaction.breadcrumbs?.find(
        breadcrumb => breadcrumb.category === 'fetch' && (breadcrumb.data?.url as string)?.includes('/allowed'),
      );

      expect(fetchBreadcrumb).toMatchObject({
        category: 'fetch',
        type: 'http',
        data: expect.objectContaining({
          method: 'GET',
          status_code: 200,
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/outgoing-fetch');
  await runner.completed();
});
