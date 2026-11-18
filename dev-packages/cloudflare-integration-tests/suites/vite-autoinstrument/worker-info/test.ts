import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

it('uses the wrangler name as server_name and the compatibility date as runtime version', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope(
        {
          level: 'error',
          server_name: 'cloudflare-vite-autoinstrument-worker-info',
          contexts: { runtime: { name: 'cloudflare', version: '2025-06-17' } },
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Error with the worker info',
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
