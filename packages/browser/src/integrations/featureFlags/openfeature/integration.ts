/**
 * Sentry integration for capturing OpenFeature feature flag evaluations.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from "@sentry/browser";
 * import { OpenFeature } from "@openfeature/web-sdk";
 *
 * Sentry.init(..., integrations: [Sentry.openFeatureIntegration()]);
 * OpenFeature.setProvider(new MyProviderOfChoice());
 * OpenFeature.addHooks(new Sentry.OpenFeatureIntegrationHook());
 * ```
 */
import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import {
  _INTERNAL_addFeatureFlagToActiveSpan,
  _INTERNAL_copyFlagsFromScopeToEvent,
  _INTERNAL_insertFlagToScope,
  defineIntegration,
} from '@sentry/core';
import type { EvaluationDetails, HookContext, HookHints, JsonValue, OpenFeatureHook } from './types';

export const openFeatureIntegration = defineIntegration(() => {
  return {
    name: 'OpenFeature',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return _INTERNAL_copyFlagsFromScopeToEvent(event);
    },
  };
}) satisfies IntegrationFn;

/**
 * OpenFeature Hook class implementation.
 */
export class OpenFeatureIntegrationHook implements OpenFeatureHook {
  /**
   * Successful evaluation result.
   */
  public after(_hookContext: Readonly<HookContext<JsonValue>>, evaluationDetails: EvaluationDetails<JsonValue>): void {
    _INTERNAL_insertFlagToScope(evaluationDetails.flagKey, evaluationDetails.value);
    _INTERNAL_addFeatureFlagToActiveSpan(evaluationDetails.flagKey, evaluationDetails.value);
  }

  /**
   * On error evaluation result.
   */
  public error(hookContext: Readonly<HookContext<JsonValue>>, _error: unknown, _hookHints?: HookHints): void {
    _INTERNAL_insertFlagToScope(hookContext.flagKey, hookContext.defaultValue);
    _INTERNAL_addFeatureFlagToActiveSpan(hookContext.flagKey, hookContext.defaultValue);
  }
}
