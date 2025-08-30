import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  defineIntegration,
  fill,
} from '@sentry/core';
import type { GrowthBook, GrowthBookClass } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from GrowthBook.
 *
 * See the feature flag documentation: https://develop.sentry.dev/sdk/expected-features/#feature-flags
 *
 * @example
 * ```
 * import { GrowthBook } from '@growthbook/growthbook';
 * import * as Sentry from '@sentry/browser';
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [Sentry.growthbookIntegration({ growthbookClass: GrowthBook })],
 * });
 *
 * const gb = new GrowthBook();
 * gb.isOn('my-feature');
 * Sentry.captureException(new Error('something went wrong'));
 * ```
 */
export const growthbookIntegration = defineIntegration(({ growthbookClass }: { growthbookClass: GrowthBookClass }) => {
  return {
    name: 'GrowthBook',

    setupOnce() {
      const proto = growthbookClass.prototype as GrowthBook;
      fill(proto, 'isOn', _wrapBooleanReturningMethod);
      fill(proto, 'getFeatureValue', _wrapBooleanReturningMethod);
      // Also capture evalFeature when present. Not all versions have it, so guard.
      if (typeof (proto as unknown as Record<string, unknown>).evalFeature === 'function') {
        fill(proto as any, 'evalFeature', _wrapBooleanReturningMethod as any);
      }
    },

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return _INTERNAL_copyFlagsFromScopeToEvent(event);
    },
  };
}) satisfies IntegrationFn;

function _wrapBooleanReturningMethod(
  original: (this: GrowthBook, ...args: unknown[]) => unknown,
): (this: GrowthBook, ...args: unknown[]) => unknown {
  return function (this: GrowthBook, ...args: unknown[]): unknown {
    const flagName = args[0];
    const result = original.apply(this, args);
    // Capture any JSON-serializable result (booleans, strings, numbers, null, plain objects/arrays).
    // Skip functions/symbols/undefined.
    if (
      typeof flagName === 'string' &&
      typeof result !== 'undefined' &&
      typeof result !== 'function' &&
      typeof result !== 'symbol'
    ) {
      _INTERNAL_insertFlagToScope(flagName, result);
      _INTERNAL_addFeatureFlagToActiveSpan(flagName, result);
    }
    return result;
  };
}
