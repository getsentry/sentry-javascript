/**
 * OpenFeature integration.
 *
 * Add the openFeatureIntegration() function call to your integration lists.
 * Add the integration hook to your OpenFeature object.
 *   - OpenFeature.getClient().addHooks(new OpenFeatureIntegrationHook());
 */
import type { Client, Event, EventHint, IntegrationFn } from '@sentry/types';
import type { EvaluationDetails, FlagValue, HookContext, HookHints, JsonValue, OpenFeatureHook } from './types';

import { defineIntegration, getCurrentScope } from '@sentry/core';
import { insertToFlagBuffer } from '../../../utils/featureFlags'

export const openFeatureIntegration = defineIntegration(() => {
  return {
    name: 'OpenFeature',

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
 * OpenFeature Hook class implementation.
 */
export class OpenFeatureIntegrationHook implements OpenFeatureHook {
  /**
   * Successful evaluation result.
   */
  public after(_hookContext: Readonly<HookContext<JsonValue>>, evaluationDetails: EvaluationDetails<JsonValue>): void {
    processEvent(evaluationDetails.flagKey, evaluationDetails.value);
  }

  /**
   * On error evaluation result.
   */
  public error(hookContext: Readonly<HookContext<JsonValue>>, _error: unknown, _hookHints?: HookHints): void {
    processEvent(hookContext.flagKey, hookContext.defaultValue);
  }
}

function processEvent(key: string, value: FlagValue): void {
  if (typeof value === 'boolean') {
    const scopeContexts = getCurrentScope().getScopeData().contexts;
    if (!scopeContexts.flags) {
      scopeContexts.flags = { values: [] };
    }
    const flagBuffer = scopeContexts.flags.values;
    insertToFlagBuffer(flagBuffer, key, value);
  }
  return;
}
