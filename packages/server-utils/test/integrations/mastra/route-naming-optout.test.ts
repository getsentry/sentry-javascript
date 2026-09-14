import { tracingChannel } from 'node:diagnostics_channel';
import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mastraIntegration } from '../../../src/integrations/mastra';
import { CHANNELS } from '../../../src/orchestrion/channels';

// `instrumentMastra` subscribes at most once per process, so this opt-out case — which must NOT
// subscribe a `start` handler at all — needs its own file to avoid a default integration from another
// test leaving a subscriber on the process-global diagnostics channel.
describe('mastraIntegration route-naming opt-out', () => {
  beforeEach(() => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@mastra/core'] };
  });
  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it('does not inject middleware when instrumentServerRoutes is false', () => {
    mastraIntegration({ instrumentServerRoutes: false }).setup?.({ on: () => () => undefined } as unknown as Client);
    const config: any = { server: {} };
    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).start.publish({ arguments: [config] });
    expect(config.server.middleware).toBeUndefined();
  });
});
