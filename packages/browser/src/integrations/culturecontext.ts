import type { CultureContext, IntegrationFn } from '@sentry/core';
import { defineIntegration, GLOBAL_OBJ } from '@sentry/core';

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
    if (typeof (GLOBAL_OBJ as { Intl?: typeof Intl }).Intl === 'undefined') {
      return undefined;
    }

    const options = Intl.DateTimeFormat().resolvedOptions();

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
