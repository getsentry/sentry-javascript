import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientOptions } from '../../../src/types/options';
import * as debugLoggerModule from '../../../src/utils/debug-logger';
import { maybeWarnAboutIgnoredTransactionOptions } from '../../../src/utils/warnAboutIgnoredTransactionOptions';

describe('maybeWarnAboutIgnoredTransactionOptions', () => {
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

  it('warns when `beforeSendTransaction` is set and span streaming is enabled', () => {
    maybeWarnAboutIgnoredTransactionOptions(
      options({ traceLifecycle: 'stream', beforeSendTransaction: event => event }),
    );

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('`beforeSendTransaction` and `ignoreTransactions`');
  });

  it('warns when `ignoreTransactions` is set and span streaming is enabled', () => {
    maybeWarnAboutIgnoredTransactionOptions(
      options({ traceLifecycle: 'stream', ignoreTransactions: ['/healthcheck'] }),
    );

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('`beforeSendTransaction` and `ignoreTransactions`');
  });

  it('warns only once when both options are set', () => {
    maybeWarnAboutIgnoredTransactionOptions(
      options({
        traceLifecycle: 'stream',
        beforeSendTransaction: event => event,
        ignoreTransactions: ['/healthcheck'],
      }),
    );

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('points at the replacement options and the opt-out', () => {
    maybeWarnAboutIgnoredTransactionOptions(
      options({ traceLifecycle: 'stream', beforeSendTransaction: event => event }),
    );

    const message = consoleWarnSpy.mock.calls[0]?.[0];
    expect(message).toContain('`beforeSendSpan` and `ignoreSpans`');
    expect(message).toContain("`traceLifecycle: 'static'`");
  });

  it('does not warn when the trace lifecycle is static', () => {
    maybeWarnAboutIgnoredTransactionOptions(
      options({
        traceLifecycle: 'static',
        beforeSendTransaction: event => event,
        ignoreTransactions: ['/healthcheck'],
      }),
    );

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when neither option is set', () => {
    maybeWarnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream' }));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for an empty `ignoreTransactions` array', () => {
    maybeWarnAboutIgnoredTransactionOptions(options({ traceLifecycle: 'stream', ignoreTransactions: [] }));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
