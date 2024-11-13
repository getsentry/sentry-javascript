import type { Client, Event, EventHint, IntegrationFn } from '@sentry/types';
import type { LDContext, LDEvaluationDetail, LDInspectionFlagUsedHandler } from './types';

import { insertToFlagBuffer } from '../../../utils/featureFlags'
import { defineIntegration, getCurrentScope } from '@sentry/core';

/**
 * Sentry integration for capturing feature flags from LaunchDarkly.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/browser';
 * import {launchDarklyIntegration, buildLaunchDarklyFlagUsedInspector} from '@sentry/browser';
 * import * as LaunchDarkly from 'launchdarkly-js-client-sdk';
 *
 * Sentry.init(..., integrations: [launchDarklyIntegration()])
 * const ldClient = LaunchDarkly.initialize(..., {inspectors: [buildLaunchDarklyFlagUsedHandler()]});
 * ```
 */
export const launchDarklyIntegration = defineIntegration(() => {
  return {
    name: 'LaunchDarkly',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      const scope = getCurrentScope();
      const flagContext = scope.getScopeData().contexts.flags;
      const flagBuffer = flagContext ? flagContext.values : [];

      if (event.contexts === undefined) {
        event.contexts = {};
      }
      event.contexts.flags = { values: [...flagBuffer] };
      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * LaunchDarkly hook that listens for flag evaluations and updates the `flags`
 * context in our Sentry scope. This needs to be registered as an
 * 'inspector' in LaunchDarkly initialize() options, separately from
 * `launchDarklyIntegration`. Both are needed to collect feature flags on error.
 */
export function buildLaunchDarklyFlagUsedHandler(): LDInspectionFlagUsedHandler {
  return {
    name: 'sentry-flag-auditor',
    type: 'flag-used',

    synchronous: true,

    /**
     * Handle a flag evaluation by storing its name and value on the current scope.
     */
    method: (flagKey: string, flagDetail: LDEvaluationDetail, _context: LDContext) => {
      if (typeof flagDetail.value === 'boolean') {
        const scopeContexts = getCurrentScope().getScopeData().contexts;
        if (!scopeContexts.flags) {
          scopeContexts.flags = { values: [] };
        }
        const flagBuffer = scopeContexts.flags.values;
        insertToFlagBuffer(flagBuffer, flagKey, flagDetail.value);
      }
      return;
    },
  };
}
