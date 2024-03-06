import * as util from 'util';
import { addBreadcrumb, convertIntegrationFnToClass, defineIntegration, getClient } from '@sentry/core';
import type { Client, Integration, IntegrationClass, IntegrationFn } from '@sentry/types';
import { addConsoleInstrumentationHandler, severityLevelFromString } from '@sentry/utils';

const INTEGRATION_NAME = 'Console';

const _consoleIntegration = (() => {
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

export const consoleIntegration = defineIntegration(_consoleIntegration);

/**
 * Console module integration.
 * @deprecated Use `consoleIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const Console = convertIntegrationFnToClass(INTEGRATION_NAME, consoleIntegration) as IntegrationClass<
  Integration & { setup: (client: Client) => void }
>;

// eslint-disable-next-line deprecation/deprecation
export type Console = typeof Console;
