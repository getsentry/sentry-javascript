import type { Client, Event, EventHint, IntegrationFn } from '@sentry/core';
import type { EvaluationDetails, HookContext, HookHints, JsonValue, OpenFeatureClient, OpenFeatureHook } from './types';

import { defineIntegration } from '@sentry/core';
import { copyFlagsFromScopeToEvent, insertFlagToScope } from '../../../utils/featureFlags';

/**
 * Sentry integration for capturing feature flags from the OpenFeature SDK.
 *
 * See the [feature flag documentation](https://develop.sentry.dev/sdk/expected-features/#feature-flags) for more information.
 *
 * @example
 * ```
 * import * as Sentry from '@sentry/browser';
 * import { OpenFeature } from '@openfeature/web-sdk';
 *
 * OpenFeature.setProvider(new MyProviderOfChoice());
 * const client = OpenFeature.getClient();
 * const openFeatureIntegration = Sentry.openFeatureIntegration({openFeatureClient: client});
 *
 * Sentry.init({
 *   dsn: '___PUBLIC_DSN___',
 *   integrations: [openFeatureIntegration]
 * });
 * ```
 */
export const openFeatureIntegration = defineIntegration((openFeatureClient: OpenFeatureClient) => {
  return {
    name: 'OpenFeature',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event {
      return copyFlagsFromScopeToEvent(event);
    },

    setupOnce() {
      openFeatureClient.addHooks(new OpenFeatureIntegrationHook());
    },
  };
}) satisfies IntegrationFn;

/**
 * OpenFeatureHook class implementation. Listens for flag evaluations and
 * updates the `flags` context in our Sentry scope.
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
