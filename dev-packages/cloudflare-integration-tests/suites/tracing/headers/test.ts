import { createTestServer } from '@sentry-internal/test-utils';
import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

it('Tracing headers', async ({ signal }) => {
  expect.assertions(5);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/', headers => {
      expect(headers['baggage']).toEqual(expect.any(String));
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-0$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
      expect(headers['traceparent']).toEqual(expect.stringMatching(/^00-([a-f\d]{32})-([a-f\d]{16})-00$/));
    })
    .start();

  const runner = createRunner(__dirname)
    .withServerUrl(SERVER_URL)
    .expect(
      eventEnvelope({
        level: 'error',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Test error to capture trace headers',
              stacktrace: {
                frames: expect.any(Array),
              },
              mechanism: { type: 'auto.http.cloudflare', handled: false },
            },
          ],
        },
        breadcrumbs: [
          {
            category: 'fetch',
            data: {
              method: 'GET',
              status_code: 200,
              url: expect.stringContaining('http://localhost:'),
            },
            timestamp: expect.any(Number),
            type: 'http',
          },
        ],
        request: {
          headers: expect.any(Object),
          method: 'GET',
          url: expect.any(String),
        },
      }),
    )
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
  closeTestServer();
});
