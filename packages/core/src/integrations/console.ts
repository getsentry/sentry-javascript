import { addBreadcrumb } from '../breadcrumbs';
import { getClient } from '../currentScopes';
import { addConsoleInstrumentationHandler } from '../instrument/console';
import { defineIntegration } from '../integration';
import type { ConsoleLevel } from '../types-hoist/instrument';
import { CONSOLE_LEVELS } from '../utils/debug-logger';
import { severityLevelFromString } from '../utils/severity';
import { safeJoin } from '../utils/string';
import { GLOBAL_OBJ } from '../utils/worldwide';

interface ConsoleIntegrationOptions {
  levels: ConsoleLevel[];
}

type GlobalObjectWithUtil = typeof GLOBAL_OBJ & {
  util: {
    format: (...args: unknown[]) => string;
  };
};

const INTEGRATION_NAME = 'Console';

/**
 * Captures calls to the `console` API as breadcrumbs in Sentry.
 *
 * By default the integration instruments `console.debug`, `console.info`, `console.warn`, `console.error`,
 * `console.log`, `console.trace`, and `console.assert`. You can use the `levels` option to customize which
 * levels are captured.
 *
 * @example
 *
 * ```js
 * Sentry.init({
 *   integrations: [Sentry.consoleIntegration({ levels: ['error', 'warn'] })],
 * });
 * ```
 */
export const consoleIntegration = defineIntegration((options: Partial<ConsoleIntegrationOptions> = {}) => {
  const levels = new Set(options.levels || CONSOLE_LEVELS);

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.has(level)) {
          return;
        }

        addConsoleBreadcrumb(level, args);
      });
    },
  };
});

/**
 * Capture a console breadcrumb.
 *
 * Exported just for tests.
 */
export function addConsoleBreadcrumb(level: ConsoleLevel, args: unknown[]): void {
  const breadcrumb = {
    category: 'console',
    data: {
      arguments: args,
      logger: 'console',
    },
    level: severityLevelFromString(level),
    message: formatConsoleArgs(args),
  };

  if (level === 'assert') {
    if (args[0] === false) {
      const assertionArgs = args.slice(1);
      breadcrumb.message =
        assertionArgs.length > 0 ? `Assertion failed: ${formatConsoleArgs(assertionArgs)}` : 'Assertion failed';
      breadcrumb.data.arguments = assertionArgs;
    } else {
      // Don't capture a breadcrumb for passed assertions
      return;
    }
  }

  addBreadcrumb(breadcrumb, {
    input: args,
    level,
  });
}

function formatConsoleArgs(values: unknown[]): string {
  return 'util' in GLOBAL_OBJ && typeof (GLOBAL_OBJ as GlobalObjectWithUtil).util.format === 'function'
    ? (GLOBAL_OBJ as GlobalObjectWithUtil).util.format(...values)
    : safeJoin(values, ' ');
}
