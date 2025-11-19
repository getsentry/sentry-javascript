import type { Client } from '../../client';
import { defineIntegration } from '../../integration';
import type { Event, EventHint } from '../../types-hoist/event';
import type { IntegrationFn } from '../../types-hoist/integration';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
} from '../../utils/featureFlags';
import { fill } from '../../utils/object';

interface GrowthBookLike {
  isOn(this: GrowthBookLike, featureKey: string, ...rest: unknown[]): boolean;
  getFeatureValue(this: GrowthBookLike, featureKey: string, defaultValue: unknown, ...rest: unknown[]): unknown;
}

export type GrowthBookClassLike = new (...args: unknown[]) => GrowthBookLike;

/**
 * Sentry integration for capturing feature flag evaluations from GrowthBook.
 *
 * Only boolean results are captured at this time.
 *
 * @example
 * ```typescript
 * import { GrowthBook } from '@growthbook/growthbook';
 * import * as Sentry from '@sentry/browser'; // or '@sentry/node'
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   integrations: [
 *     Sentry.growthbookIntegration({ growthbookClass: GrowthBook })
 *   ]
 * });
 * ```
 */
export const growthbookIntegration: IntegrationFn = defineIntegration(
  ({ growthbookClass }: { growthbookClass: GrowthBookClassLike }) => {
    return {
      name: 'GrowthBook',

      setupOnce() {
        const proto = growthbookClass.prototype as GrowthBookLike;

        // Type guard and wrap isOn
        if (typeof proto.isOn === 'function') {
          fill(proto, 'isOn', _wrapAndCaptureBooleanResult);
        }

        // Type guard and wrap getFeatureValue
        if (typeof proto.getFeatureValue === 'function') {
          fill(proto, 'getFeatureValue', _wrapAndCaptureBooleanResult);
        }
      },

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return _INTERNAL_copyFlagsFromScopeToEvent(event);
      },
    };
  },
);

function _wrapAndCaptureBooleanResult(
  original: (this: GrowthBookLike, ...args: unknown[]) => unknown,
): (this: GrowthBookLike, ...args: unknown[]) => unknown {
  return function (this: GrowthBookLike, ...args: unknown[]): unknown {
    const flagName = args[0];
    const result = original.apply(this, args);

    if (typeof flagName === 'string' && typeof result === 'boolean') {
      _INTERNAL_insertFlagToScope(flagName, result);
      _INTERNAL_addFeatureFlagToActiveSpan(flagName, result);
    }

    return result;
  };
}
