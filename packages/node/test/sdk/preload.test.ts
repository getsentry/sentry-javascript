import { logger } from '@sentry/utils';

describe('preload', () => {
  afterEach(() => {
    jest.resetAllMocks();
    logger.disable();

    delete process.env.SENTRY_DEBUG;
    delete process.env.SENTRY_PRELOAD_INTEGRATIONS;

    jest.resetModules();
  });

  it('works without env vars', async () => {
    const logSpy = jest.spyOn(console, 'log');

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledTimes(0);
  });

  it('works with SENTRY_DEBUG set', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    // We want to swallow these logs
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    process.env.SENTRY_DEBUG = '1';

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Express instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Graphql instrumentation');
  });

  it('works with SENTRY_DEBUG & SENTRY_PRELOAD_INTEGRATIONS set', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    // We want to swallow these logs
    jest.spyOn(console, 'debug').mockImplementation(() => {});

    process.env.SENTRY_DEBUG = '1';
    process.env.SENTRY_PRELOAD_INTEGRATIONS = 'Http,Express';

    await import('../../src/preload');

    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Http instrumentation');
    expect(logSpy).toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Express instrumentation');
    expect(logSpy).not.toHaveBeenCalledWith('Sentry Logger [log]:', '[Sentry] Preloaded Graphql instrumentation');
  });
});
