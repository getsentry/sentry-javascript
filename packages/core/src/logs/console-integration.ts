import { getClient } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { addConsoleInstrumentationHandler } from '../instrument/console';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { ConsoleLevel } from '../types-hoist/instrument';
import type { IntegrationFn } from '../types-hoist/integration';
import { CONSOLE_LEVELS, debug } from '../utils/debug-logger';
import { _INTERNAL_captureLog } from './internal';
import { createConsoleTemplateAttributes, formatConsoleArgs, hasConsoleSubstitutions } from './utils';

interface CaptureConsoleOptions {
  levels: ConsoleLevel[];
}

const INTEGRATION_NAME = 'ConsoleLogs';

const DEFAULT_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.log.console',
};

const _consoleLoggingIntegration = ((options: Partial<CaptureConsoleOptions> = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const { enableLogs, normalizeDepth = 3, normalizeMaxBreadth = 1_000 } = client.getOptions();
      if (!enableLogs) {
        DEBUG_BUILD && debug.warn('`enableLogs` is not enabled, ConsoleLogs integration disabled');
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.includes(level)) {
          return;
        }

        const firstArg = args[0];
        const followingArgs = args.slice(1);

        if (level === 'assert') {
          if (!firstArg) {
            const assertionMessage =
              followingArgs.length > 0
                ? `Assertion failed: ${formatConsoleArgs(followingArgs, normalizeDepth, normalizeMaxBreadth)}`
                : 'Assertion failed';
            _INTERNAL_captureLog({ level: 'error', message: assertionMessage, attributes: DEFAULT_ATTRIBUTES });
          }
          return;
        }

        const isLevelLog = level === 'log';

        const shouldGenerateTemplate =
          args.length > 1 && typeof args[0] === 'string' && !hasConsoleSubstitutions(args[0]);
        const attributes = {
          ...DEFAULT_ATTRIBUTES,
          ...(shouldGenerateTemplate ? createConsoleTemplateAttributes(firstArg, followingArgs) : {}),
        };

        _INTERNAL_captureLog({
          level: isLevelLog ? 'info' : level,
          message: formatConsoleArgs(args, normalizeDepth, normalizeMaxBreadth),
          severityNumber: isLevelLog ? 10 : undefined,
          attributes,
        });
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures calls to the `console` API as logs in Sentry. Requires the `enableLogs` option to be enabled.
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
 *   enableLogs: true,
 *   integrations: [Sentry.consoleLoggingIntegration({ levels: ['error', 'warn'] })],
 * });
 * ```
 */
export const consoleLoggingIntegration = defineIntegration(_consoleLoggingIntegration);
