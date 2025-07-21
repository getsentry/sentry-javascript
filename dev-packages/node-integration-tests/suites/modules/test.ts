import { SDK_VERSION } from '@sentry/core';
import { join } from 'path';
import { afterAll, describe, test } from 'vitest';
import { cleanupChildProcesses, createRunner } from '../../utils/runner';

describe('modulesIntegration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  test('CJS', async () => {
    const runner = createRunner(__dirname, 'server.js')
      .withMockSentryServer()
      .expect({
        event: {
          modules: {
            // exact version comes from require.caches
            express: '4.21.1',
            // this comes from package.json
            '@sentry/node': SDK_VERSION,
            yargs: '^16.2.0',
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test1', { expectError: true });
    await runner.completed();
  });

  test('ESM', async () => {
    const runner = createRunner(__dirname, 'server.mjs')
      .withInstrument(join(__dirname, 'instrument.mjs'))
      .withMockSentryServer()
      .expect({
        event: {
          modules: {
            // this comes from package.json
            express: '^4.21.1',
            '@sentry/node': SDK_VERSION,
            yargs: '^16.2.0',
          },
        },
      })
      .start();
    runner.makeRequest('get', '/test1', { expectError: true });
    await runner.completed();
  });
});
