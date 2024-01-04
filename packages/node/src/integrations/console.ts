import * as util from 'util';
import { addBreadcrumb, convertIntegrationFnToClass, getClient } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { addConsoleInstrumentationHandler, severityLevelFromString } from '@sentry/utils';

const INTEGRATION_NAME = 'Console';

const consoleIntegration = (() => {
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
            message: util.format.apply(undefined, args),
          },
          {
            input: [...args],
            level,
          },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/** Console module integration */
// eslint-disable-next-line deprecation/deprecation
export const Console = convertIntegrationFnToClass(INTEGRATION_NAME, consoleIntegration);
