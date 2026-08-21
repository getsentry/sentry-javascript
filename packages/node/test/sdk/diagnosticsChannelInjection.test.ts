import { debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { registerDiagnosticsChannelInjection, detectOrchestrionSetup } = vi.hoisted(() => ({
  registerDiagnosticsChannelInjection: vi.fn(),
  detectOrchestrionSetup: vi.fn(),
}));

vi.mock('@sentry/server-utils/orchestrion/register', () => ({
  registerDiagnosticsChannelInjection,
}));
vi.mock('@sentry/server-utils', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, detectOrchestrionSetup };
});

import { init } from '../../src/sdk';
import { cleanupOtel, resetGlobals } from '../helpers/mockSdkInit';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

// Runtime diagnostics-channel injection is installed by default, independent of tracing (the channel
// integrations capture errors as well as spans). It can be turned off via `enableRuntimeChannelInjection: false`.
describe('diagnostics-channel injection', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
    vi.spyOn(debug, 'enable').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanupOtel();
    resetGlobals();
    vi.clearAllMocks();
  });

  it('registers the injection hooks and runs detection by default with tracing enabled', () => {
    init({ dsn: PUBLIC_DSN, tracesSampleRate: 1, enableOpenTelemetrySetup: false });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });

  it('registers the injection hooks by default even when tracing is disabled', () => {
    init({ dsn: PUBLIC_DSN, enableOpenTelemetrySetup: false });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });

  it('does not register the injection hooks when `enableRuntimeChannelInjection` is false', () => {
    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      enableRuntimeChannelInjection: false,
      enableOpenTelemetrySetup: false,
    });

    expect(registerDiagnosticsChannelInjection).not.toHaveBeenCalled();
    expect(detectOrchestrionSetup).not.toHaveBeenCalled();
  });

  it('registers the injection hooks when `enableRuntimeChannelInjection` is true and tracing is disabled', () => {
    init({ dsn: PUBLIC_DSN, enableRuntimeChannelInjection: true, enableOpenTelemetrySetup: false });

    expect(registerDiagnosticsChannelInjection).toHaveBeenCalledTimes(1);
    expect(detectOrchestrionSetup).toHaveBeenCalledTimes(1);
  });
});
