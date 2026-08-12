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

import { init } from '../../src/sdk';
import { cleanupOtel, resetGlobals } from '../helpers/mockSdkInit';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

// Channel-based (orchestrion diagnostics-channel) instrumentation is the default in v11: `init()`
// installs the injection hooks unconditionally when span recording is enabled, and skips them when
// tracing is off (there would be no channel subscribers to feed).
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
});
