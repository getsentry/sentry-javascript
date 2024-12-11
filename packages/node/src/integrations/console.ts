import * as util from 'node:util';
import {
  addBreadcrumb,
  addConsoleInstrumentationHandler,
  defineIntegration,
  getClient,
  severityLevelFromString,
  truncate,
} from '@sentry/core';

const INTEGRATION_NAME = 'Console';

/**
 * Capture console logs as breadcrumbs.
 */
export const consoleIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client) {
          return;
        }

        addBreadcrumb(
          {
            category: 'console',
            level: severityLevelFromString(level),
            message: truncate(util.format.apply(undefined, args), 2048), // 2KB
          },
          {
            input: [...args],
            level,
          },
        );
      });
    },
  };
});
