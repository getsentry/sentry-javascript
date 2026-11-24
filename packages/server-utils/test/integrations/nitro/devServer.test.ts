import { tracingChannel } from 'node:diagnostics_channel';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { isNitroDevServer } from '@sentry/core/server';
import { captureNitroDevServer } from '../../../src/integrations/nitro/devServer';
import { nitroChannels } from '../../../src/orchestrion/config/nitro';

const devAppChannel = tracingChannel(nitroChannels.NITRO_DEV_APP);

function createDevApp(runner?: string): void {
  const nitro = { options: { dev: true, devServer: { runner } } };
  devAppChannel.traceSync(() => undefined, { arguments: [nitro, async () => new Response()] });
}

describe('captureNitroDevServer', () => {
  beforeAll(() => {
    captureNitroDevServer();
  });

  afterEach(() => {
    delete (GLOBAL_OBJ as { __SENTRY_NITRO_DEV_SERVER__?: boolean }).__SENTRY_NITRO_DEV_SERVER__;
    vi.unstubAllEnvs();
  });

  it.each([undefined, 'node-worker', 'node-process'])(
    'marks the dev server, which runs Nitro in a worker with the %s runner',
    runner => {
      createDevApp(runner);

      expect(isNitroDevServer()).toBe(true);
    },
  );

  it('marks the dev server for a worker runner from `NITRO_DEV_RUNNER`', () => {
    vi.stubEnv('NITRO_DEV_RUNNER', 'node-process');

    createDevApp();

    expect(isNitroDevServer()).toBe(true);
  });

  it('does not mark the dev server when Nitro runs in it with the `self` runner', () => {
    createDevApp('self');

    expect(isNitroDevServer()).toBe(false);
  });
});
