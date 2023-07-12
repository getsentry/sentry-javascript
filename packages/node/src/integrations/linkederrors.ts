import type { Event, EventHint, EventProcessor, Hub, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';

import { exceptionFromError } from '../eventbuilder';
import { ContextLines } from './contextlines';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

/** Adds SDK info to an event. */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public readonly name: string = LinkedErrors.id;

  /**
   * @inheritDoc
   */
  private readonly _key: string;

  /**
   * @inheritDoc
   */
  private readonly _limit: number;

  /**
   * @inheritDoc
   */
  public constructor(options: { key?: string; limit?: number } = {}) {
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(async (event: Event, hint?: EventHint) => {
      const hub = getCurrentHub();
      const client = hub.getClient();
      const self = hub.getIntegration(LinkedErrors);

      if (!client || !self) {
        return event;
      }

      applyAggregateErrorsToEvent(
        exceptionFromError,
        client.getOptions().stackParser,
        self._key,
        self._limit,
        event,
        hint,
      );

      // If the ContextLines integration is enabled, we add source code context to linked errors
      // because we can't guarantee the order that integrations are run.
      const contextLines = getCurrentHub().getIntegration(ContextLines);
      if (contextLines) {
        await contextLines.addSourceContext(event);
      }

      return event;
    });
  }
}
