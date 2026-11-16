import { expect, it } from 'vitest';
import { eventEnvelope } from '../../expect';
import { createRunner } from '../../runner';

it('uses the SENTRY_NAME env variable as server_name', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          server_name: 'my-worker',
          contexts: { runtime: { name: 'cloudflare', version: '2025-01-15' } },
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Error with a server name',
                stacktrace: {
                  frames: expect.any(Array),
                },
                mechanism: { type: 'auto.http.cloudflare', handled: false },
              },
            ],
          },
          request: {
            cookies: {},
            headers: expect.any(Object),
            method: 'GET',
            url: expect.any(String),
          },
        },
        { includeTransaction: false },
      ),
    )
    .start(signal);
  await runner.makeRequest('get', '/', { expectError: true });
  await runner.completed();
});
