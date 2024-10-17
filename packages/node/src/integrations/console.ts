import * as util from 'node:util';
import { addBreadcrumb, defineIntegration, getClient } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { addConsoleInstrumentationHandler, severityLevelFromString } from '@sentry/utils';

const INTEGRATION_NAME = 'Console';

const TRUNCATION_MSG = ' (breadcrumb truncated)';
const MAX_BREADCRUMB_MSG_LENGTH = 2048; // 2 KB

const _consoleIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      addConsoleInstrumentationHandler(({ args, level }) => {
        if (getClient() !== client) {
          return;
        }

        // Truncate the breadcrumb length to max 2KB including the truncated snippet
        let formattedMessage: string = util.format.apply(undefined, args);
        if (formattedMessage.length > MAX_BREADCRUMB_MSG_LENGTH) {
          formattedMessage = formattedMessage.slice(MAX_BREADCRUMB_MSG_LENGTH - TRUNCATION_MSG.length) + TRUNCATION_MSG;
        }

        addBreadcrumb(
          {
            category: 'console',
            level: severityLevelFromString(level),
            message: formattedMessage,
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
