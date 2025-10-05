import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';
import { createTestServer } from '../../../../utils/server';

describe('outgoing fetch', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing fetch requests are correctly instrumented with tracing & spans are disabled', async ({ signal }) => {
      expect.assertions(11);

      const [SERVER_URL, closeTestServer] = await createTestServer({ signal })
        .get('/api/v0', headers => {
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
          expect(headers['baggage']).toEqual(expect.any(String));
        })
        .get('/api/v1', headers => {
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f0-9]{32})-([a-f0-9]{16})$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000');
          expect(headers['baggage']).toEqual(expect.any(String));
        })
        .get('/api/v2', headers => {
          expect(headers['baggage']).toBeUndefined();
          expect(headers['sentry-trace']).toBeUndefined();
        })
        .get('/api/v3', headers => {
          expect(headers['baggage']).toBeUndefined();
          expect(headers['sentry-trace']).toBeUndefined();
        })
        .start();

      await createRunner({ signal })
        .withEnv({ SERVER_URL })
        .expect({
          event: {
            exception: {
              values: [
                {
                  type: 'Error',
                  value: 'foo',
                },
              ],
            },
          },
        })
        .start()
        .completed();
      closeTestServer;
    });
  });
});
