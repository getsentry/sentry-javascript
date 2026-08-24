import { createTestServer } from '@sentry-internal/test-utils';
import { expect, test } from 'vitest';
import { createRunner } from '../../../../utils/runner';

test('tracePropagationTargets match regardless of casing', async () => {
  expect.assertions(9);

  const [SERVER_URL, closeTestServer] = await createTestServer()
    .get('/api/regex', headers => {
      expect(headers['baggage']).toEqual(expect.any(String));
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
    })
    .get('/API/STRING', headers => {
      expect(headers['baggage']).toEqual(expect.any(String));
      expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
      expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
    })
    .get('/api/no-match', headers => {
      expect(headers['baggage']).toBeUndefined();
      expect(headers['sentry-trace']).toBeUndefined();
    })
    .start();

  await createRunner(__dirname, 'scenario.ts')
    .withEnv({ SERVER_URL })
    .expect({
      transaction: {},
    })
    .start()
    .completed();
  closeTestServer();
});
