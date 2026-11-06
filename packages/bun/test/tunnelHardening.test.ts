import * as SentryCore from '@sentry/core';
import type { Subprocess } from 'bun';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import type { FakeIngests } from '../../../dev-packages/test-utils/src/tunnel-hardening';
import {
  EXPECTED_TUNNEL_OUTCOMES,
  runTunnelHardeningCases,
  startFakeIngests,
} from '../../../dev-packages/test-utils/src/tunnel-hardening';

// Bun answers nothing on a connection whose first request awaits anything while a second one is queued behind it,
// Sentry or not.
const PIPELINED_CASES = [
  'pipelined tunnel then app',
  'rejected tunnel with a big unread body, then app',
  'pipelined app, tunnel, app',
];

describe('managed tunnel hardening', () => {
  let ingests: FakeIngests;

  beforeAll(async () => {
    ingests = await startFakeIngests();
  });

  afterAll(async () => {
    await ingests.close();
  });

  test.each([
    ['Bun.serve with a fetch handler', 'fetch'],
    ['Bun.serve with routes and a catch-all', 'routes'],
    ['node:http', 'node-http'],
  ])(
    '%s',
    async (_name, server) => {
      const app = Bun.spawn([process.execPath, path.join(__dirname, 'fixtures/tunnelHardeningServer.ts')], {
        env: {
          ...process.env,
          SERVER: server,
          ALLOWED_DSNS: ingests.allDsns().join(','),
          TUNNEL_PATH: SentryCore.getTunnelPath(ingests.dsn('ok')),
        },
        stdout: 'pipe',
        stderr: 'inherit',
      });

      try {
        const output = readOutput(app);
        const port = Number((await output.waitFor(/PORT (\d+)/))[1]);

        const results = await runTunnelHardeningCases({
          port,
          ingests,
          getTunnelPath: SentryCore.getTunnelPath,
          skip: PIPELINED_CASES,
        });

        expect(results.filter(result => result.health !== '200')).toEqual([]);
        expect(Object.fromEntries(results.map(result => [result.name, result.outcome]))).toMatchObject(
          Object.fromEntries(
            Object.entries(EXPECTED_TUNNEL_OUTCOMES).filter(([name]) => !PIPELINED_CASES.includes(name)),
          ),
        );
        // The tunnel reports nothing of its own to the app's project.
        expect(output.text().match(/^EVENT .*/gm)).toBeNull();
      } finally {
        app.kill();
      }
    },
    120_000,
  );
});

/**
 * Collects the app's stdout.
 */
function readOutput(app: Subprocess<'ignore', 'pipe', 'inherit'>): {
  text: () => string;
  waitFor: (pattern: RegExp) => Promise<RegExpMatchArray>;
} {
  let text = '';
  const listeners = new Set<() => void>();
  void (async () => {
    for await (const chunk of app.stdout) {
      text += new TextDecoder().decode(chunk);
      listeners.forEach(listener => listener());
    }
  })();

  return {
    text: () => text,
    waitFor: pattern =>
      new Promise(resolve => {
        const check = (): void => {
          const match = text.match(pattern);
          if (match) {
            listeners.delete(check);
            resolve(match);
          }
        };
        listeners.add(check);
        check();
      }),
  };
}
