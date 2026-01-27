import { SDK_VERSION } from '@sentry/core';
import { expect, it } from 'vitest';
import { SHORT_UUID_MATCHER, UUID_MATCHER } from '../../expect';
import { createRunner } from '../../runner';

it('Hono app captures errors (Hono SDK)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('event');

      // todo: check with function eventEnvelope

      // Validate error event structure
      expect(itemPayload).toMatchObject({
        level: 'error',
        platform: 'javascript',
        transaction: 'GET /error',
        // fixme: should be hono
        sdk: { name: 'sentry.javascript.cloudflare', version: SDK_VERSION },
        // fixme: should contain trace
        // trace: expect.objectContaining({ trace_id: UUID_MATCHER }),
        exception: {
          values: expect.arrayContaining([
            expect.objectContaining({
              type: 'Error',
              value: 'Test error from Hono app',
              mechanism: expect.objectContaining({
                type: 'generic', // fixme: should be 'auto.faas.hono.error_handler'
                handled: true, // fixme: should be false
              }),
            }),
          ]),
        },
        request: expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('/error'),
        }),
      });
    })
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
