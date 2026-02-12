import type { Integration, ParameterizedString } from '@sentry/core';
import { consoleSandbox, defineIntegration } from '@sentry/core';
import { FAKE_FUNCTION } from './common';
import { DEBUG_BUILD } from './debug-build';

/**
 * This is a shim for the logger namespace.
 * It is needed in order for the CDN bundles to continue working when users add/remove logs
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
function logShim(_message: unknown, _attributes?: unknown): void {
  DEBUG_BUILD &&
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using Sentry.logger.* even though this bundle does not include logs.');
    });
}

/**
 * This is a shim for the logger.fmt template literal function.
 * It is needed in order for the CDN bundles to continue working when users add/remove logs
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
function fmtShim(_strings: TemplateStringsArray, ..._values: unknown[]): ParameterizedString {
  DEBUG_BUILD &&
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using Sentry.logger.fmt even though this bundle does not include logs.');
    });
  return '' as ParameterizedString;
}

export const loggerShim = {
  trace: logShim,
  debug: logShim,
  info: logShim,
  warn: logShim,
  error: logShim,
  fatal: logShim,
  fmt: fmtShim,
};

/**
 * This is a shim for the consoleLoggingIntegration.
 * It is needed in order for the CDN bundles to continue working when users add/remove logs
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const consoleLoggingIntegrationShim = defineIntegration((_options?: unknown) => {
  DEBUG_BUILD &&
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using consoleLoggingIntegration() even though this bundle does not include logs.');
    });

  return {
    name: 'ConsoleLogs',
    setup: FAKE_FUNCTION,
  };
}) as () => Integration;
