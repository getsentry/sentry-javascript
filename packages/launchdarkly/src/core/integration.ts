import * as Sentry from '@sentry/browser';
import type { Client as SentryClient, Event, EventHint, IntegrationFn } from '@sentry/types';
import type { LDContext, LDEvaluationDetail, LDInspectionFlagUsedHandler } from 'launchdarkly-js-client-sdk';
import type { LaunchDarklyOptions } from '../types';
import { insertToFlagBuffer } from '@sentry/utils';

/**
 * Sentry integration for capturing feature flags from LaunchDarkly.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import {buildSentryFlagUsedInspector, buildLaunchDarklyIntegration} from '@sentry/launchdarkly';
 * import {LDClient} from 'launchdarkly-js-client-sdk';
 *
 * Sentry.init(..., integrations: [buildLaunchDarklyIntegration()])
 * const ldClient = LDClient.initialize(..., {inspectors: [buildSentryFlagUsedInspector()]});
 * ```
 */
export const buildLaunchDarklyIntegration = ((_options?: LaunchDarklyOptions) => {
  return {
    name: 'launchdarkly',

    processEvent(event: Event, _hint: EventHint, _client: SentryClient): Event {
      const scope = Sentry.getCurrentScope();
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
 * LaunchDarkly hook that listens for flag evaluations and updates the
 * flagBuffer in our current scope.
 *
 * This needs to be registered separately in the LDClient, after initializing
 * Sentry.
 */
export function buildSentryFlagUsedInspector(): LDInspectionFlagUsedHandler {
  return {
    name: 'sentry-flag-auditor',
    type: 'flag-used',

    // We don't want the handler to impact the performance of the user's flag evaluations.
    synchronous: false,

    /**
     * Handle a flag evaluation by storing its name and value on the current scope.
     */
    method: (flagKey: string, flagDetail: LDEvaluationDetail, _context: LDContext) => {
      if (typeof flagDetail.value === 'boolean') {
        const scopeContexts = Sentry.getCurrentScope().getScopeData().contexts;
        if (!scopeContexts.flags) {
          scopeContexts.flags = {values: []}
        }
        const flagBuffer = scopeContexts.flags.values;
        insertToFlagBuffer(flagBuffer, flagKey, flagDetail.value);
      }
      return;
    }
  }
}
