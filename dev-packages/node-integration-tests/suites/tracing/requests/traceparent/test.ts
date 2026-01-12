import { createTestServer } from '@sentry-internal/test-utils';
import { describe, expect } from 'vitest';
import { createEsmAndCjsTests } from '../../../../utils/runner';

describe('outgoing traceparent', () => {
  createEsmAndCjsTests(__dirname, 'scenario-fetch.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing fetch requests should get traceparent headers', async () => {
      expect.assertions(5);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v1', headers => {
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
          expect(headers['traceparent']).toEqual(expect.stringMatching(/^00-([a-f\d]{32})-([a-f\d]{16})-01$/));
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

  createEsmAndCjsTests(__dirname, 'scenario-http.mjs', 'instrument.mjs', (createRunner, test) => {
    test('outgoing http requests should get traceparent headers', async () => {
      expect.assertions(5);

      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/api/v1', headers => {
          expect(headers['baggage']).toEqual(expect.any(String));
          expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
          expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-0');
          expect(headers['traceparent']).toEqual(expect.stringMatching(/^00-([a-f\d]{32})-([a-f\d]{16})-01$/));
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
