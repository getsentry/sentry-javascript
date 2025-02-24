import { logger } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('preload', () => {
  afterEach(() => {
    vi.resetAllMocks();
    logger.disable();

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

    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Express instrumentation');
    expect(logSpy).not.toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Graphql instrumentation');
  });
});
