import { createTestServer } from '@sentry-internal/test-utils';
import { describe } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing http with maxed-out agent sockets', () => {
  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('injects trace headers into requests queued behind a busy socket', async ({ expect }) => {
      expect.assertions(5);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/request-1', headers => {
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['baggage']).toEqual(expect.any(String));
        })
        .get('/api/request-2', headers => {
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['baggage']).toEqual(expect.any(String));
        })
        .start();

      await createRunner()
        .withEnv({ SERVER_URL })
        .expect({
          transaction: {
            // we're not too concerned with the actual transaction here since this is tested elsewhere
          },
        })
        .start()
        .completed();
      closeTestServer();
    });
  });
});
