import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';

it('Basic error in fetch handler', async ({ signal }) => {
  const runner = createRunner({ signal }, __dirname)
    .expect(
      eventEnvelope({
        level: 'error',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'This is a test error from the Cloudflare integration tests',
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
    .start();
  await runner.makeRequest('get', '/', { expectError: true });
  await runner.completed();
});
