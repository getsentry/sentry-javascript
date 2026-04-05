import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';

it('Only sends one error event when withSentry is called twice', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope({
        level: 'error',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error from double-instrumented worker',
              stacktrace: {
                frames: expect.any(Array),
              },
              mechanism: { type: 'auto.http.cloudflare', handled: false },
            },
          ],
        },
        request: {
          headers: expect.any(Object),
          method: 'GET',
          url: expect.any(String),
        },
      }),
    )
    .start(signal);
  await runner.makeRequest('get', '/error', { expectError: true });
  await runner.completed();
});

it('Successful response works when withSentry is called twice', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);
  const response = await runner.makeRequest<string>('get', '/');
  expect(response).toBe('ok');
});
