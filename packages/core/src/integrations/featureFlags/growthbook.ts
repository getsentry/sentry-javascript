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
 */
export const growthbookIntegration = defineIntegration(
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

        // Type guard and wrap evalFeature if present
        const maybeEval = (proto as unknown as Record<string, unknown>).evalFeature;
        if (typeof maybeEval === 'function') {
          fill(proto as unknown as Record<string, unknown>, 'evalFeature', _wrapAndCaptureBooleanResult as any);
        }
      },

      processEvent(event: Event, _hint: EventHint, _client: Client): Event {
        return _INTERNAL_copyFlagsFromScopeToEvent(event);
      },
    };
  },
) satisfies IntegrationFn;

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
