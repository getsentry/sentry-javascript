import { getTunnelPath } from '@sentry/core';
import type { FakeIngests } from '@sentry-internal/test-utils';
import { EXPECTED_TUNNEL_OUTCOMES, runTunnelHardeningCases, startFakeIngests } from '@sentry-internal/test-utils';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('managed tunnel hardening', () => {
  let ingests: FakeIngests;

  beforeAll(async () => {
    ingests = await startFakeIngests();
  });

  afterAll(async () => {
    cleanupChildProcesses();
    await ingests.close();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('keeps the app serving whatever is thrown at the tunnel, and reports nothing of its own', async () => {
      const runner = createRunner()
        .withEnv({ ALLOWED_DSNS: ingests.allDsns().join(','), TUNNEL_PATH: getTunnelPath(ingests.dsn('ok'))! })
        // The first event is the app's own, so the tunnel captured no error along the way.
        .expect({ event: { message: 'done' } })
        .start();
      await runner.makeRequest('get', '/health');

      const results = await runTunnelHardeningCases({ port: runner.getPort()!, ingests, getTunnelPath });

      expect(results.filter(result => result.health !== '200')).toEqual([]);
      expect(Object.fromEntries(results.map(result => [result.name, result.outcome]))).toMatchObject(
        EXPECTED_TUNNEL_OUTCOMES,
      );

      await runner.makeRequest('get', '/done');
      await runner.completed();
    }, 120_000);
  });
});
