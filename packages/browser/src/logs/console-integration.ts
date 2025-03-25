import type { ConsoleLevel, IntegrationFn } from '@sentry/core';
import {
  addConsoleInstrumentationHandler,
  logger,
  CONSOLE_LEVELS,
  defineIntegration,
  safeJoin,
  getClient,
} from '@sentry/core';
import { captureLog } from './capture';
import { DEBUG_BUILD } from '../debug-build';

interface CaptureConsoleOptions {
  levels: ConsoleLevel[];
}

const INTEGRATION_NAME = 'ConsoleLogs';

const _consoleLoggingIntegration = ((options: Partial<CaptureConsoleOptions> = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!client.getOptions()._experiments?.enableLogs) {
        DEBUG_BUILD && logger.warn('`_experiments.enableLogs` is not enabled, ConsoleLogs integration disabled');
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.includes(level)) {
          return;
        }

        if (level === 'assert') {
          if (!args[0]) {
            const message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
            captureLog('error', message);
          }
          return;
        }

        const message = safeJoin(args, ' ');
        captureLog(level === 'log' ? 'info' : level, message);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures calls to the `console` API as logs in Sentry. Requires `_experiments.enableLogs` to be enabled.
 *
 * @experimental This feature is experimental and may be changed or removed in future versions.
 *
 * By default the integration instruments `console.debug`, `console.info`, `console.warn`, `console.error`,
 * `console.log`, `console.trace`, and `console.assert`. You can use the `levels` option to customize which
 * levels are captured.
 *
 * @example
 *
 * ```ts
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init({
 *   integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
 * });
 * ```
 */
export const consoleLoggingIntegration = defineIntegration(_consoleLoggingIntegration);
