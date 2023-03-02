import type { Event, EventProcessor, Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

import { PROFILING_EVENT_CACHE } from './cache';
import { addProfilingExtensionMethods } from './hubextensions';

/**
 * Browser profiling integration. Stores any event that has contexts["profile"]["profile_id"]
 * This exists because we do not want to await async profiler.stop calls as transaction.finish is called
 * in a synchronous context. Instead, we handle sending the profile async from the promise callback and
 * rely on being able to pull the event from the cache when we need to construct the envelope. This makes the
 * integration less reliable as we might be dropping profiles when the cache is full.
 *
 * @experimental
export class BrowserProfilingIntegration implements Integration {
  public readonly name: string = 'BrowserProfilingIntegration';

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    // Patching the hub to add the extension methods.
    // Warning: we have an implicit dependency on import order and we will fail patching if the constructor of
    // BrowserProfilingIntegration is called before @sentry/tracing is imported. This is because we need to patch
    // the methods of @sentry/tracing which are patched as a side effect of importing @sentry/tracing.
    addProfilingExtensionMethods();

    // Add our event processor
    addGlobalEventProcessor(this.handleGlobalEvent.bind(this));
  }

  /**
   * @inheritDoc
   */
  public handleGlobalEvent(event: Event): Event {
    const profileId = event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id'];

    if (profileId && typeof profileId === 'string') {
      if (__DEBUG_BUILD__) {
        logger.log('[Profiling] Profiling event found, caching it.');
      }
      PROFILING_EVENT_CACHE.add(profileId, event);
    }

    return event;
  }
}
