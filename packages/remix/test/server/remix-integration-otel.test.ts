import * as SentryCore from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Force the OpenTelemetry branch of `remixIntegration`. `isOrchestrionInjected` is the only export
// the loaded graph needs (the tracing-channel module is mocked below), so a minimal mock suffices.
vi.mock('@sentry/server-utils/orchestrion', () => ({
  isOrchestrionInjected: () => false,
}));

// Replace both instrument helpers so we can assert the call shape without OTel/channel side effects.
vi.mock('../../src/server/integrations/opentelemetry', () => ({
  instrumentRemixWithOpenTelemetry: vi.fn(),
  addRemixSpanAttributes: vi.fn(),
}));
vi.mock('../../src/server/integrations/tracing-channel', () => ({
  instrumentRemix: vi.fn(),
}));

import { remixIntegration } from '../../src/server/integrations/RemixIntegration';
import { instrumentRemixWithOpenTelemetry } from '../../src/server/integrations/opentelemetry';
import { instrumentRemix } from '../../src/server/integrations/tracing-channel';

function mockClient(
  captureActionFormDataKeys: Record<string, string | boolean> | undefined,
  httpBodies: string[],
): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getOptions: () => ({ captureActionFormDataKeys }),
    getDataCollectionOptions: () => ({ httpBodies }),
  } as unknown as NodeClient);
}

describe('remixIntegration (OpenTelemetry-based)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('wraps the opted-in form-data keys in the RemixInstrumentation options object', () => {
    mockClient({ username: true }, ['incomingRequest']);

    remixIntegration().setupOnce?.();

    // Must be wrapped as `{ actionFormDataAttributes }` — passing the bare map would leave
    // RemixInstrumentation's default `{ _action: 'actionType' }` mapping in place.
    expect(instrumentRemixWithOpenTelemetry).toHaveBeenCalledWith({ actionFormDataAttributes: { username: true } });
    expect(instrumentRemix).not.toHaveBeenCalled();
  });

  it('passes undefined attributes when form-data capture is not opted into', () => {
    // `httpBodies` without `incomingRequest` means capture is off, regardless of the configured keys.
    mockClient({ username: true }, []);

    remixIntegration().setupOnce?.();

    expect(instrumentRemixWithOpenTelemetry).toHaveBeenCalledWith({ actionFormDataAttributes: undefined });
  });
});
