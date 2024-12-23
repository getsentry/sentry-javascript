/**
 * OpenFeature integration.
 *
 * Add the openFeatureIntegration() function call to your integration lists.
 * Add the integration hook to your OpenFeature object.
 *   - OpenFeature.getClient().addHooks(new OpenFeatureIntegrationHook());
 */
import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import type { EvaluationDetails, HookContext, HookHints, JsonValue, OpenFeatureHook, OpenFeatureClient } from './types';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';

export const openFeatureIntegration = defineIntegration((openFeatureClient: OpenFeatureClient) => {
  return {
    name: 'OpenFeature',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    setupOnce() {
      openFeatureClient.addHooks([new OpenFeatureIntegrationHook()]);
    }
  };
}) satisfies IntegrationFn;

/**
 * OpenFeature Hook class implementation.
 */
class OpenFeatureIntegrationHook implements OpenFeatureHook {
  /**
   * Successful evaluation result.
   */
  public after(_hookContext: Readonly<HookContext<JsonValue>>, evaluationDetails: EvaluationDetails<JsonValue>): void {
    insertFlagToScope(evaluationDetails.flagKey, evaluationDetails.value);
  }

  /**
   * On error evaluation result.
   */
  public error(hookContext: Readonly<HookContext<JsonValue>>, _error: unknown, _hookHints?: HookHints): void {
    insertFlagToScope(hookContext.flagKey, hookContext.defaultValue);
  }
}
