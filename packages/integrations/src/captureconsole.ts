import { captureException, captureMessage, convertIntegrationFnToClass, getClient, withScope } from '@sentry/core';
import type { CaptureContext, IntegrationFn } from '@sentry/types';
import {
  CONSOLE_LEVELS,
  GLOBAL_OBJ,
  addConsoleInstrumentationHandler,
  addExceptionMechanism,
  safeJoin,
  severityLevelFromString,
} from '@sentry/utils';

interface CaptureConsoleOptions {
  levels?: string[];
}

const INTEGRATION_NAME = 'CaptureConsole';

const captureConsoleIntegration = ((options: CaptureConsoleOptions = {}) => {
  const levels = options.levels || CONSOLE_LEVELS;

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

        consoleHandler(args, level);
      });
    },
  };
}) satisfies IntegrationFn;

/** Send Console API calls as Sentry Events */
// eslint-disable-next-line deprecation/deprecation
export const CaptureConsole = convertIntegrationFnToClass(INTEGRATION_NAME, captureConsoleIntegration);

function consoleHandler(args: unknown[], level: string): void {
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
        handled: false,
        type: 'console',
      });

      return event;
    });

    if (level === 'assert' && args[0] === false) {
      const message = `Assertion failed: ${safeJoin(args.slice(1), ' ') || 'console.assert'}`;
      scope.setExtra('arguments', args.slice(1));
      captureMessage(message, captureContext);
      return;
    }

    const error = args.find(arg => arg instanceof Error);
    if (level === 'error' && error) {
      captureException(error, captureContext);
      return;
    }

    const message = safeJoin(args, ' ');
    captureMessage(message, captureContext);
  });
}
