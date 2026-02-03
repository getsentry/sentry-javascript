import { SDK_VERSION } from '@sentry/core';
import { expect, it } from 'vitest';
import { eventEnvelope, SHORT_UUID_MATCHER, UUID_MATCHER } from '../../expect';
import { createRunner } from '../../runner';

it('Hono app captures errors (Hono SDK)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          transaction: 'GET /error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Test error from Hono app',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.faas.hono.error_handler', handled: false },
              },
            ],
          },
          request: {
            headers: expect.any(Object),
            method: 'GET',
            url: expect.any(String),
          },
        },
        { includeSampleRand: true, sdk: 'hono' },
      ),
    )
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('transaction');

      expect(itemPayload).toMatchObject({
        type: 'transaction',
        platform: 'javascript',
        transaction: 'GET /error',
        contexts: {
          trace: {
            span_id: expect.any(String),
            trace_id: expect.any(String),
            op: 'http.server',
            status: 'internal_error',
            origin: 'auto.http.cloudflare',
          },
        },
        request: expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/error'),
        }),
      });
    })

    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

it('Hono app captures parametrized names', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('transaction');

      expect(itemPayload).toMatchObject({
        type: 'transaction',
        platform: 'javascript',
        transaction: 'GET /hello/:name',
        contexts: {
          trace: {
            span_id: SHORT_UUID_MATCHER,
            trace_id: UUID_MATCHER,
            op: 'http.server',
            status: 'ok',
            origin: 'auto.http.cloudflare',
          },
        },
        request: expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/hello/:name'),
        }),
      });
    })

    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/hello/:name', { expectError: false });
  await runner.completed();
});
