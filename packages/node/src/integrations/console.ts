import * as util from 'node:util';
import { addBreadcrumb, defineIntegration, getClient } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { addConsoleInstrumentationHandler, severityLevelFromString, truncate } from '@sentry/utils';

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
}) satisfies IntegrationFn;

/**
 * Capture console logs as breadcrumbs.
 */
export const consoleIntegration = defineIntegration(_consoleIntegration);
