import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import type { ConsoleLevel, IntegrationFn, ParameterizedString } from '../types-hoist';
import { CONSOLE_LEVELS, GLOBAL_OBJ, addConsoleInstrumentationHandler, logger, safeJoin } from '../utils-hoist';
import { _INTERNAL_captureLog } from './exports';

interface CaptureConsoleOptions {
  levels: ConsoleLevel[];
}

type GlobalObjectWithUtil = typeof GLOBAL_OBJ & {
  util: {
    format: (...args: unknown[]) => string;
  };
};

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
            let message: ParameterizedString = 'Assertion failed';
            const followingArgs = args.slice(1);
            if (followingArgs.length > 0) {
              message = new String(`Assertion failed: ${formatConsoleArgs(followingArgs)}`) as ParameterizedString;
              message.__sentry_template_string__ = `Assertion failed: ${followingArgs.map(() => '%s').join(' ')}`;
              message.__sentry_template_values__ = followingArgs;
            }
            _INTERNAL_captureLog({ level: 'error', message });
          }
          return;
        }

        const isLevelLog = level === 'log';
        _INTERNAL_captureLog({
          level: isLevelLog ? 'info' : level,
          message: formatConsoleArgs(args),
          severityNumber: isLevelLog ? 10 : undefined,
        });
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

function formatConsoleArgs(values: unknown[]): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : safeJoin(values, ' ');
}
