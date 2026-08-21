import { debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { registerDiagnosticsChannelInjection, detectOrchestrionSetup } = vi.hoisted(() => ({
  registerDiagnosticsChannelInjection: vi.fn(),
  detectOrchestrionSetup: vi.fn(),
}));

vi.mock('@sentry/server-utils/orchestrion/register', () => ({
  registerDiagnosticsChannelInjection,
}));
vi.mock('@sentry/server-utils/orchestrion', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, detectOrchestrionSetup };
});

import { expressIntegration } from '../../src';
import { init } from '../../src/sdk';
import { cleanupOtel, resetGlobals } from '../helpers/mockSdkInit';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

// Channel-based (orchestrion diagnostics-channel) instrumentation is the default in v11: `init()`
// installs the injection hooks when span recording is enabled, or when a channel-based integration
// (e.g. `expressIntegration()`) is configured — those can capture errors even with tracing off. With
// tracing off and no such integration there are no channel subscribers, so the hooks are skipped.
describe('diagnostics-channel injection default', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
    vi.spyOn(debug, 'enable').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanupOtel();
    resetGlobals();
    vi.clearAllMocks();
  });

  it('registers the injection hooks and runs detection when span recording is enabled', () => {
    init({ dsn: PUBLIC_DSN, tracesSampleRate: 1, enableOpenTelemetrySetup: false });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });

  it('does not register the injection hooks when tracing is disabled', () => {
    init({ dsn: PUBLIC_DSN, enableOpenTelemetrySetup: false });

    expect(registerDiagnosticsChannelInjection).not.toHaveBeenCalled();
    expect(detectOrchestrionSetup).not.toHaveBeenCalled();
  });

  it('registers the injection hooks when a channel-based integration is configured, even with tracing disabled', () => {
    init({ dsn: PUBLIC_DSN, enableOpenTelemetrySetup: false, integrations: [expressIntegration()] });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });

  it('registers the injection hooks when a channel-based integration is added via an `integrations` function', () => {
    init({
      dsn: PUBLIC_DSN,
      enableOpenTelemetrySetup: false,
      integrations: defaults => [...defaults, expressIntegration()],
    });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });

  it('does not register the injection hooks when only non-channel integrations are configured and tracing is disabled', () => {
    init({
      dsn: PUBLIC_DSN,
      enableOpenTelemetrySetup: false,
      integrations: [{ name: 'CustomNonChannelIntegration', setup: () => undefined }],
    });

    expect(registerDiagnosticsChannelInjection).not.toHaveBeenCalled();
    expect(detectOrchestrionSetup).not.toHaveBeenCalled();
  });
});
