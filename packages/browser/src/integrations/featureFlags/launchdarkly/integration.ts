import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  defineIntegration,
} from '@sentry/core';
import type { LDContext, LDEvaluationDetail, LDInspectionFlagUsedHandler } from './types';

/**
 * Sentry integration for capturing feature flag evaluations from LaunchDarkly.
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
      return _INTERNAL_copyFlagsFromScopeToEvent(event);
    },
  };
}) satisfies IntegrationFn;

/**
 * LaunchDarkly hook to listen for and buffer flag evaluations. This needs to
 * be registered as an 'inspector' in LaunchDarkly initialize() options,
 * separately from `launchDarklyIntegration`. Both the hook and the integration
 * are needed to capture LaunchDarkly flags.
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
      _INTERNAL_insertFlagToScope(flagKey, flagDetail.value);
      _INTERNAL_addFeatureFlagToActiveSpan(flagKey, flagDetail.value);
    },
  };
}
