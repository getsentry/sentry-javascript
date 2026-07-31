import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientOptions } from '../../../src/types/options';
import * as debugLoggerModule from '../../../src/utils/debug-logger';
import { warnAboutIgnoredTransactionOptions } from '../../../src/utils/warnAboutIgnoredTransactionOptions';

describe('warnAboutIgnoredTransactionOptions', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(debugLoggerModule, 'consoleSandbox').mockImplementation(cb => cb());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function options(overrides: Partial<ClientOptions>): ClientOptions {
    return { integrations: [], transport: () => ({}) as never, stackParser: () => [], ...overrides } as ClientOptions;
  }

  it('warns about `beforeSendTransaction` when span streaming is enabled', () => {
    warnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream', beforeSendTransaction: event => event }));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('`beforeSendTransaction`');
    expect(consoleWarnSpy.mock.calls[0]?.[0]).not.toContain('`ignoreTransactions`');
  });

  it('warns about `ignoreTransactions` when span streaming is enabled', () => {
    warnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream', ignoreTransactions: ['/healthcheck'] }));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('`ignoreTransactions`');
    expect(consoleWarnSpy.mock.calls[0]?.[0]).not.toContain('`beforeSendTransaction`');
  });

  it('warns once about both options when both are set', () => {
    warnAboutIgnoredTransactionOptions(
      options({
        traceLifecycle: 'stream',
        beforeSendTransaction: event => event,
        ignoreTransactions: ['/healthcheck'],
      }),
    );

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('`beforeSendTransaction` and `ignoreTransactions`');
  });

  it('does not warn when the trace lifecycle is static', () => {
    warnAboutIgnoredTransactionOptions(
      options({
        traceLifecycle: 'static',
        beforeSendTransaction: event => event,
        ignoreTransactions: ['/healthcheck'],
      }),
    );

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when neither option is set', () => {
    warnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream' }));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for an empty `ignoreTransactions` array', () => {
    warnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream', ignoreTransactions: [] }));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
