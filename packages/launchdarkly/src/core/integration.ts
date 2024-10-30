/* eslint-disable @sentry-internal/sdk/no-class-field-initializers */

import * as Sentry from '@sentry/browser';
import type { Client as SentryClient, Event, EventHint, IntegrationFn } from '@sentry/types';
import type { LDContext, LDEvaluationDetail, LDInspectionFlagUsedHandler } from 'launchdarkly-js-client-sdk';
import type { LaunchDarklyOptions } from './types';

// import type { Client } from '/client';
// import type { Event, EventHint } from './event';

/**
 * Sentry integration for capturing feature flags from LaunchDarkly.
 *
 * See the [feature flag documentation](TODO:) for more information.
 *
 * @example
 *
 * ```
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.replayIntegration()],
 * });
 * ```
 */
export const launchDarklyIntegration = ((_options?: LaunchDarklyOptions) => {
  // const { _ldClient } = options;
  // const ldClient = _ldClient as LDClient; // for type hint

  return {
    name: 'launchdarkly',

    processEvent(event: Event, hint: EventHint, client: SentryClient): Event | null | PromiseLike<Event | null> {
      const scope = Sentry.getCurrentScope(); // client doesn't have getCurrentScope
      const flagData = { values: scope.flags.get() };
      if (event.contexts) {
        event.contexts.flags = flagData;
      } else {
        event.contexts = { flags: flagData };
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * https://launchdarkly.github.io/js-client-sdk/interfaces/LDInspectionFlagUsedHandler.html //TODO: rm this link
 * TODO: docstring
 */
export class SentryInspector implements LDInspectionFlagUsedHandler {
  public name = 'sentry-feature-flag-monitor';

  public synchronous = true; // TODO: T or F?

  public type = 'flag-used' as const;

  /**
   * TODO: docstring
   */
  public method(flagKey: string, flagDetail: LDEvaluationDetail, _context: LDContext): void {
    if (typeof flagDetail.value === 'boolean') {
      const flags = Sentry.getCurrentScope().flags;
      flags.set(flagKey, flagDetail.value);
    }
    return;
  }
}

/*

import SentryInspector from @sentry/ld

client = LDClient.init(..., SentryInspector)

sentry.init(integrations: [LDIntegration])

*/
