import {
  addBreadcrumb,
  addConsoleInstrumentationHandler,
  defineIntegration,
  getClient,
  safeJoin,
  severityLevelFromString,
} from '@sentry/core';

const INTEGRATION_NAME = 'Console';

/**
 * Capture console logs as breadcrumbs. Enabled by default in the Cloudflare SDK.
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
            message: safeJoin(args, ' '),
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
