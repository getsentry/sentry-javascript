import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';

it('captures an error thrown in Bun.serve fetch handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'This is a test error from the Bun integration tests',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.bun.serve', handled: false },
              },
            ],
          },
          request: expect.objectContaining({
            method: 'GET',
            url: expect.stringContaining('/error'),
          }),
        },
        { includeSampleRand: true },
      ),
    )
    .ignore('transaction')
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

it('captures a manually sent message', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const [, envelopeItems] = envelope;
      const [itemHeader, itemPayload] = envelopeItems[0];

      expect(itemHeader.type).toBe('event');

      expect(itemPayload).toMatchObject({
        level: 'info',
        message: 'Hello from Bun',
      });
    })
    .ignore('transaction')
    .start(signal);
  await runner.makeRequest('get', '/message');
  await runner.completed();
});
