import type { Integration } from '@sentry/core';
import { debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../../src/sdk';
import { setDiagnosticsChannelInjectionLoader } from '../../src/sdk/diagnosticsChannelInjection';
import { cleanupOtel, resetGlobals } from '../helpers/mockSdkInit';

// eslint-disable-next-line no-var
declare var global: any;

const PUBLIC_DSN = 'https://username@domain/123';

function mockIntegration(name: string): Integration {
  return { name, setupOnce: vi.fn() };
}

// These tests run in definition order: the first runs before any loader is set
// (opt-out), the second sets it (opt-in). The module-level loader state is
// isolated per test file by vitest, so it doesn't leak elsewhere.
describe('diagnostics-channel injection integration swap', () => {
  beforeEach(() => {
    global.__SENTRY__ = {};
    vi.spyOn(debug, 'enable').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanupOtel();
    resetGlobals();
    vi.clearAllMocks();
  });

  it('does not swap integrations when not opted in', () => {
    // Distinct names from the opt-in test below: `@sentry/core` only runs
    // `setupOnce` once per integration name per process, so reusing names across
    // tests would suppress later calls.
    const otelNest = mockIntegration('OptOutNest');
    const http = mockIntegration('OptOutHttp');

    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      skipOpenTelemetrySetup: true,
      defaultIntegrations: [otelNest, http],
    });

    // No opt-in -> the supplied defaults are set up untouched.
    expect(otelNest.setupOnce).toHaveBeenCalledTimes(1);
    expect(http.setupOnce).toHaveBeenCalledTimes(1);
  });

  it('replaces the named OTel integrations with the channel integrations, even when defaultIntegrations are supplied by a framework SDK', () => {
    const channelMysql = mockIntegration('Mysql');
    const channelNest = mockIntegration('Nest');
    const register = vi.fn();
    const detect = vi.fn();
    setDiagnosticsChannelInjectionLoader(() => ({
      integrations: [channelMysql, channelNest],
      replacedOtelIntegrationNames: ['Mysql', 'Nest'],
      register,
      detect,
    }));

    // Mimics `@sentry/nestjs`, which prepends its OTel `Nest` integration to
    // its own `defaultIntegrations` array (so node's `getDefaultIntegrations`
    // swap never sees it; swap must happen in `init`).
    const otelNest = mockIntegration('Nest');
    const http = mockIntegration('Http');

    init({
      dsn: PUBLIC_DSN,
      tracesSampleRate: 1,
      skipOpenTelemetrySetup: true,
      defaultIntegrations: [otelNest, http],
    });

    // OTel 'Nest' filtered out, never set up.
    expect(otelNest.setupOnce).not.toHaveBeenCalled();
    // Channel replacements set up instead.
    expect(channelNest.setupOnce).toHaveBeenCalledTimes(1);
    expect(channelMysql.setupOnce).toHaveBeenCalledTimes(1);
    // Unrelated default preserved.
    expect(http.setupOnce).toHaveBeenCalledTimes(1);
    // Hooks installed and detection ran once.
    expect(register).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledTimes(1);
  });
});
