import { beforeEach, describe, expect, it, vi } from 'vitest';

const { instrumentCalls, injection } = vi.hoisted(() => ({
  instrumentCalls: [] as string[],
  injection: { enabled: false },
}));

// Control the gating flag.
vi.mock('../../../src/sdk/diagnosticsChannelInjection', () => ({
  isDiagnosticsChannelInjectionEnabled: () => injection.enabled,
}));

// Record which instrumentations actually get generated, without registering real
// OTel module hooks (the creator is never invoked).
vi.mock('@sentry/node-core', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    generateInstrumentOnce: (name: string) => Object.assign(() => instrumentCalls.push(name), { id: name }),
  };
});

// The >=5.11.0 diagnostics_channel subscription is irrelevant here; keep it inert.
vi.mock('@sentry/server-utils', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, subscribeRedisDiagnosticChannels: () => undefined };
});

import { instrumentRedis } from '../../../src/integrations/tracing/redis';

describe('instrumentRedis ioredis gating', () => {
  beforeEach(() => {
    instrumentCalls.length = 0;
  });

  it('instruments the OTel ioredis monkey-patch when diagnostics-channel injection is disabled', () => {
    injection.enabled = false;

    instrumentRedis();

    expect(instrumentCalls).toContain('Redis.IORedis');
    expect(instrumentCalls).toContain('Redis.Redis');
  });

  it('skips the OTel ioredis monkey-patch when diagnostics-channel injection is enabled', () => {
    injection.enabled = true;

    instrumentRedis();

    // ioredis is owned by orchestrion; node-redis is still instrumented by OTel.
    expect(instrumentCalls).not.toContain('Redis.IORedis');
    expect(instrumentCalls).toContain('Redis.Redis');
  });
});
