import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { addConsoleInstrumentationHandler } from '../instrument/console';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { ConsoleLevel } from '../types-hoist/instrument';
import type { IntegrationFn } from '../types-hoist/integration';
import { CONSOLE_LEVELS, debug } from '../utils/debug-logger';
import { isPrimitive } from '../utils/is';
import { normalize } from '../utils/normalize';
import { GLOBAL_OBJ } from '../utils/worldwide';
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

const DEFAULT_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.console.logging',
};

const _consoleLoggingIntegration = ((options: Partial<CaptureConsoleOptions> = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const { _experiments, normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = client.getOptions();
      if (!_experiments?.enableLogs) {
        DEBUG_BUILD && debug.warn('`_experiments.enableLogs` is not enabled, ConsoleLogs integration disabled');
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.includes(level)) {
          return;
        }

        if (level === 'assert') {
          if (!args[0]) {
            const followingArgs = args.slice(1);
            const assertionMessage =
              followingArgs.length > 0
                ? `Assertion failed: ${formatConsoleArgs(followingArgs, normalizeDepth, normalizeMaxBreadth)}`
                : 'Assertion failed';
            _INTERNAL_captureLog({ level: 'error', message: assertionMessage, attributes: DEFAULT_ATTRIBUTES });
          }
          return;
        }

        const isLevelLog = level === 'log';
        _INTERNAL_captureLog({
          level: isLevelLog ? 'info' : level,
          message: formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth),
          severityNumber: isLevelLog ? 10 : undefined,
          attributes: DEFAULT_ATTRIBUTES,
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

function formatConsoleArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : safeJoinConsoleArgs(values, normalizeDepth, normalizeMaxBreadth);
}

function safeJoinConsoleArgs(values: unknown[], normalizeDepth: number, normalizeMaxBreadth: number): string {
  return values
    .map(value =>
      isPrimitive(value) ? String(value) : JSON.stringify(normalize(value, normalizeDepth, normalizeMaxBreadth)),
    )
    .join(' ');
}
