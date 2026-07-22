import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instrumentCalls, dcState } = vi.hoisted(() => ({
  instrumentCalls: [] as string[],
  dcState: { tracingChannel: undefined as unknown },
}));

// Control whether `tracingChannel` is available (Node >= 18.19). The redis gate skips the OTel
// monkey-patches whenever orchestrion can run (i.e. `tracingChannel` exists), since the orchestrion
// channel integrations then own the older ioredis/node-redis ranges.
vi.mock('node:diagnostics_channel', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    get tracingChannel() {
      return dcState.tracingChannel;
    },
  };
});

// Record which instrumentations actually get generated, without registering real
// OTel module hooks (the creator is never invoked).
vi.mock('../../../src/otel/instrument', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    generateInstrumentOnce: (name: string) => Object.assign(() => instrumentCalls.push(name), { id: name }),
  };
});

import { instrumentRedis } from '../../../src/integrations/tracing/redis';

describe('instrumentRedis ioredis gating', () => {
  beforeEach(() => {
    instrumentCalls.length = 0;
  });

  it('instruments the OTel monkey-patches when tracingChannel is unavailable (Node < 18.19)', () => {
    dcState.tracingChannel = undefined;

    instrumentRedis();

    expect(instrumentCalls).toContain('Redis.IORedis');
    expect(instrumentCalls).toContain('Redis.Redis');
  });

  it('skips both OTel monkey-patches when tracingChannel is available (orchestrion owns them)', () => {
    dcState.tracingChannel = (() => undefined) as unknown;

    instrumentRedis();

    expect(instrumentCalls).not.toContain('Redis.IORedis');
    expect(instrumentCalls).not.toContain('Redis.Redis');
  });
});
