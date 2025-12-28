import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

it('Hono app captures errors', async ({ signal }) => {
  const runner = createRunner(__dirname)
    // First envelope: error event from Hono error handler
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
        true,
      ),
    )
    // Second envelope: transaction event
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1];
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          type: 'transaction',
          transaction: 'GET /error',
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              status: 'internal_error',
            }),
          }),
        }),
      );
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});
