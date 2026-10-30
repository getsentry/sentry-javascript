import type { AsyncContextStrategy } from '@sentry/core';
import { GLOBAL_OBJ, setAsyncContextStrategy } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

// The channel subscription runs once per module instance, so each test loads a fresh copy.
async function setUpIntegration(): Promise<void> {
  const { anthropicAIIntegration } = await import('../../src/integrations/anthropic');
  anthropicAIIntegration().setup!(new TestClient(getDefaultTestClientOptions()));
}

describe('anthropicAIIntegration', () => {
  beforeEach(() => {
    vi.resetModules();
    // A tracing-channel binding, so the integration subscribes synchronously.
    setAsyncContextStrategy({
      getTracingChannelBinding: () => ({ asyncLocalStorage: {}, getStoreWithActiveSpan: () => ({}) as never }),
    } as unknown as AsyncContextStrategy);
    vi.stubEnv('ANTHROPIC_OPEN_TELEMETRY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it("turns off the SDK's own OpenTelemetry spans once the SDK is instrumented", async () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@anthropic-ai/sdk'] };

    await setUpIntegration();

    expect(process.env.ANTHROPIC_OPEN_TELEMETRY).toBe('false');
  });

  it("keeps the SDK's own spans when the SDK is not instrumented", async () => {
    await setUpIntegration();

    expect(process.env.ANTHROPIC_OPEN_TELEMETRY).toBeUndefined();
  });

  it('keeps a value the user set', async () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@anthropic-ai/sdk'] };
    vi.stubEnv('ANTHROPIC_OPEN_TELEMETRY', 'true');

    await setUpIntegration();

    expect(process.env.ANTHROPIC_OPEN_TELEMETRY).toBe('true');
  });
});
