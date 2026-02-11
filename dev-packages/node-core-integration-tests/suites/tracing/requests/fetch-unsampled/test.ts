import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing fetch', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing fetch requests are correctly instrumented when not sampled', async () => {
      expect.assertions(11);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v0', headers => {
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-0$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
        })
        .get('/api/v1', headers => {
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-0$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
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

      await createRunner()
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
      closeTestServer();
    });
  });
});
