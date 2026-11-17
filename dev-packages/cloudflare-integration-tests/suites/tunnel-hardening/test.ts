import { getTunnelPath } from '@sentry/core';
import type { FakeIngests } from '@sentry-internal/test-utils';
import { EXPECTED_TUNNEL_OUTCOMES, runTunnelHardeningCases, startFakeIngests } from '@sentry-internal/test-utils';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRunner } from '../../runner';

// `wrangler dev` stalls the next request after any worker answers before reading a large body, Sentry or not.
const WRANGLER_DEV_STALLS = ['70KB header line', 'binary garbage', 'rejected tunnel with a big unread body, then app'];

let ingests: FakeIngests;

beforeAll(async () => {
  ingests = await startFakeIngests();
});

afterAll(async () => {
  await ingests.close();
});

it('keeps the worker serving whatever is thrown at the tunnel, and reports nothing of its own', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs(
      '--var',
      `ALLOWED_DSNS:${ingests.allDsns().join(',')}`,
      '--var',
      `TUNNEL_PATH:${getTunnelPath(ingests.dsn('ok'))}`,
    )
    // The first event is the app's own, so the tunnel captured no error along the way.
    .expect(envelope => {
      expect(envelope[1][0]?.[1]).toMatchObject({ message: 'done' });
    })
    .start(signal);
  await runner.makeRequest('get', '/health');

  const results = await runTunnelHardeningCases({
    port: await runner.getPort(),
    ingests,
    getTunnelPath,
    skip: WRANGLER_DEV_STALLS,
  });

  expect(results.filter(result => result.health !== '200')).toEqual([]);
  expect(Object.fromEntries(results.map(result => [result.name, result.outcome]))).toMatchObject(
    Object.fromEntries(
      Object.entries(EXPECTED_TUNNEL_OUTCOMES).filter(([name]) => !WRANGLER_DEV_STALLS.includes(name)),
    ),
  );

  await runner.makeRequest('get', '/done');
  await runner.completed();
}, 180_000);
