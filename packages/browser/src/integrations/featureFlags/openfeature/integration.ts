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
import type { Client, Event, EventHint, IntegrationFn, Span } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import {
  bufferSpanFeatureFlag,
  copyFlagsFromScopeToEvent,
  freezeSpanFeatureFlags,
  insertFlagToScope,
} from '../../../utils/featureFlags';
import type { EvaluationDetails, HookContext, HookHints, JsonValue, OpenFeatureHook } from './types';

export const openFeatureIntegration = defineIntegration(() => {
  return {
    name: 'OpenFeature',

    setup(client: Client) {
      client.on('spanEnd', (span: Span) => {
        freezeSpanFeatureFlags(span);
      });
    },

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
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
    insertFlagToScope(evaluationDetails.flagKey, evaluationDetails.value);
    bufferSpanFeatureFlag(evaluationDetails.flagKey, evaluationDetails.value);
  }

  /**
   * On error evaluation result.
   */
  public error(hookContext: Readonly<HookContext<JsonValue>>, _error: unknown, _hookHints?: HookHints): void {
    insertFlagToScope(hookContext.flagKey, hookContext.defaultValue);
    bufferSpanFeatureFlag(hookContext.flagKey, hookContext.defaultValue);
  }
}
