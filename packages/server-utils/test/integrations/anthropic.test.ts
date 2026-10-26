import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicAIIntegration } from '../../src/integrations/anthropic';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

function setUpIntegration(): void {
  anthropicAIIntegration().setup!(new TestClient(getDefaultTestClientOptions()));
}

describe('anthropicAIIntegration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("turns off the SDK's own OpenTelemetry spans", () => {
    vi.stubEnv('ANTHROPIC_OPEN_TELEMETRY', undefined);

    setUpIntegration();

    expect(process.env.ANTHROPIC_OPEN_TELEMETRY).toBe('false');
  });

  it('keeps a value the user set', () => {
    vi.stubEnv('ANTHROPIC_OPEN_TELEMETRY', 'true');

    setUpIntegration();

    expect(process.env.ANTHROPIC_OPEN_TELEMETRY).toBe('true');
  });
});
