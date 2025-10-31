import { expect, test } from 'vitest';
import { conditionalTest } from '../../../utils';
import { createRunner } from '../../../utils/runner';
import { createTestServer } from '../../../utils/server';

// This test requires Node.js 22+ because it depends on the 'http.client.request.created'
// diagnostic channel for baggage header propagation, which only exists since Node 22.12.0+ and 23.2.0+
conditionalTest({ min: 22 })('node >=22', () => {
  test('SentryHttpIntegration should instrument correct requests when tracePropagationTargets option is provided', async () => {
    expect.assertions(11);

    const [SERVER_URL, closeTestServer] = await createTestServer()
      .get('/api/v0', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
      })
      .get('/api/v1', headers => {
        expect(headers['baggage']).toEqual(expect.any(String));
        expect(headers['sentry-trace']).toEqual(expect.stringMatching(/^([a-f\d]{32})-([a-f\d]{16})-1$/));
        expect(headers['sentry-trace']).not.toEqual('00000000000000000000000000000000-0000000000000000-1');
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

    await createRunner(__dirname, 'scenario.ts')
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
