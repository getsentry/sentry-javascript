import type { CultureContext, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'CultureContext';

const _cultureContextIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    preprocessEvent(event) {
      const culture = getCultureContext();

      if (culture) {
        event.contexts = {
          ...event.contexts,
          culture: { ...culture, ...event.contexts?.culture },
        };
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures culture context from the browser.
 *
 * Enabled by default.
 *
 * @example
 * ```js
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init({
 *   integrations: [Sentry.cultureContextIntegration()],
 * });
 * ```
 */
export const cultureContextIntegration = defineIntegration(_cultureContextIntegration);

/**
 * Returns the culture context from the browser's Intl API.
 */
function getCultureContext(): CultureContext | undefined {
  try {
    const intl = (WINDOW as { Intl?: typeof Intl }).Intl;
    if (!intl) {
      return undefined;
    }

    const options = intl.DateTimeFormat().resolvedOptions();

    return {
      locale: options.locale,
      timezone: options.timeZone,
      calendar: options.calendar,
    };
  } catch {
    // Ignore errors
    return undefined;
  }
}
