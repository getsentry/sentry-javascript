import { getClient, withScope } from '../currentScopes';
import { captureException, captureMessage } from '../exports';
import { defineIntegration } from '../integration';
import type { CaptureContext } from '../scope';
import type { IntegrationFn } from '../types-hoist';
import { addConsoleInstrumentationHandler } from '../utils-hoist/instrument/console';
import { CONSOLE_LEVELS } from '../utils-hoist/logger';
import { addExceptionMechanism } from '../utils-hoist/misc';
import { severityLevelFromString } from '../utils-hoist/severity';
import { safeJoin } from '../utils-hoist/string';
import { GLOBAL_OBJ } from '../utils-hoist/worldwide';

interface CaptureConsoleOptions {
  levels?: string[];

  /**
   * By default, Sentry will mark captured console messages as handled.
   * Set this to `false` if you want to mark them as unhandled instead.
   *
   * @default true
   */
  handled?: boolean;
}

const INTEGRATION_NAME = 'CaptureConsole';

const _captureConsoleIntegration = ((options: CaptureConsoleOptions = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;
  const handled = options.handled ?? true;

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      if (!('console' in GLOBAL_OBJ)) {
        return;
      }

      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client || !levels.includes(level)) {
          return;
        }

        consoleHandler(args, level, handled);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Send Console API calls as Sentry Events.
 */
export const captureConsoleIntegration = defineIntegration(_captureConsoleIntegration);

function consoleHandler(args: unknown[], level: string, handled: boolean): void {
  const captureContext: CaptureContext = {
    level: severityLevelFromString(level),
    extra: {
      arguments: args,
    },
  };

  withScope(scope => {
    scope.addEventProcessor(event => {
      event.logger = 'console';

      addExceptionMechanism(event, {
        handled,
        type: 'console',
      });

      return event;
    });

    if (level === 'assert') {
      if (!args[0]) {
        const message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
        scope.setExtra('arguments', args.slice(1));
        captureMessage(message, captureContext);
      }
      return;
    }

    const error = args.find(arg => arg instanceof Error);
    if (error) {
      captureException(error, captureContext);
      return;
    }

    const message = safeJoin(args, ' ');
    captureMessage(message, captureContext);
  });
}
