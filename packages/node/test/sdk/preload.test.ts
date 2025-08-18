import { debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobals } from '../helpers/mockSdkInit';

describe('preload', () => {
  beforeEach(() => {
    // Mock this to prevent conflicts with other tests
    vi.mock('../../src/integrations/tracing', async (importOriginal: () => Promise<Record<string, unknown>>) => {
      const actual = await importOriginal();
      return {
        ...actual,
        getOpenTelemetryInstrumentationToPreload: () => [
          Object.assign(vi.fn(), { id: 'Http.sentry' }),
          Object.assign(vi.fn(), { id: 'Http' }),
          Object.assign(vi.fn(), { id: 'Express' }),
          Object.assign(vi.fn(), { id: 'Graphql' }),
        ],
      };
    });
  });

  afterEach(() => {
    debug.disable();
    resetGlobals();

    delete process.env.SENTRY_DEBUG;
    delete process.env.SENTRY_PRELOAD_INTEGRATIONS;

    vi.resetModules();
  });

  it('works without env vars', async () => {
    const logSpy = vi.spyOn(console, 'log');

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledTimes(0);
  });

  it('works with SENTRY_DEBUG set', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // We want to swallow these logs
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    process.env.SENTRY_DEBUG = '1';

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http.sentry instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Express instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Graphql instrumentation');
  });

  it('works with SENTRY_DEBUG & SENTRY_PRELOAD_INTEGRATIONS set', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // We want to swallow these logs
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    process.env.SENTRY_DEBUG = '1';
    process.env.SENTRY_PRELOAD_INTEGRATIONS = 'Http,Express';

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http.sentry instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Express instrumentation');
    expect(logSpy).not.toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Graphql instrumentation');
  });
});
