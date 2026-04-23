import { expect, it } from 'vitest';
import { eventEnvelope, SHORT_UUID_MATCHER, UUID_MATCHER } from '../../expect';
import { createRunner } from '../../runner';

it('Hono app captures parametrized errors (Hono SDK on Bun)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('transaction');

      expect(itemPayload).toMatchObject({
        type: 'transaction',
        platform: 'node',
        transaction: 'GET /error/:param',
        transaction_info: {
          source: 'route',
        },
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            op: 'http.server',
            status: 'internal_error',
            origin: 'auto.http.bun.serve',
          },
          response: {
            status_code: 500,
          },
        },
        request: expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/error/param-123'),
        }),
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

      expect(itemHeader.type).toBe('transaction');

      expect(itemPayload).toMatchObject({
        type: 'transaction',
        platform: 'node',
        transaction: 'GET /hello/:name',
        transaction_info: {
          source: 'route',
        },
        contexts: {
          trace: {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            op: 'http.server',
            status: 'ok',
            origin: 'auto.http.bun.serve',
          },
        },
        request: expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/hello/world'),
        }),
      });
    })
    .start(signal);

  await runner.makeRequest('get', '/hello/world');
  await runner.completed();
});
