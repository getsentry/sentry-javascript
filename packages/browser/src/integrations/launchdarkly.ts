import type { Client, Event, EventHint, IntegrationFn } from '@sentry/types';
import type { LDContext, LDEvaluationDetail, LDInspectionFlagUsedHandler } from 'launchdarkly-js-client-sdk';

import { insertToFlagBuffer } from '@sentry/utils';
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

      if (event.contexts === undefined) {
        event.contexts = {};
      }
      event.contexts.flags = flagContext;
      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Constructs a LaunchDarkly hook that listens for flag evaluations and updates
 * the flagBuffer in our current scope.
 *
 * This needs to be registered separately in the LD SDK initialize() options,
 * after initializing Sentry.
 */
export function buildLaunchDarklyFlagUsedHandler(): LDInspectionFlagUsedHandler {
  return {
    name: 'sentry-flag-auditor',
    type: 'flag-used',

    // We don't want the handler to impact the performance of the user's flag evaluations.
    synchronous: false, // TODO: this could lead to race conditions where an error directly after an eval might not contain the eval
    // TODO: the flag buffer itself isn't thread-safe, yet this handler and the event processor could access it at the same time.

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
