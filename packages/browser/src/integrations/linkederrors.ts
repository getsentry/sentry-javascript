import type { Event, EventHint, EventProcessor, Hub, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';

import { exceptionFromError } from '../eventbuilder';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

interface LinkedErrorsOptions {
  key: string;
  limit: number;
}

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
  private readonly _key: LinkedErrorsOptions['key'];

  /**
   * @inheritDoc
   */
  private readonly _limit: LinkedErrorsOptions['limit'];

  /**
   * @inheritDoc
   */
  public constructor(options: Partial<LinkedErrorsOptions> = {}) {
    this._key = options.key || DEFAULT_KEY;
    this._limit = options.limit || DEFAULT_LIMIT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const hub = getCurrentHub();
      const client = hub.getClient();
      const self = hub.getIntegration(LinkedErrors);

      if (!client || !self) {
        return event;
      }

      applyAggregateErrorsToEvent(
        exceptionFromError,
        client.getOptions().stackParser,
        client.getOptions().maxValueLength,
        self._key,
        self._limit,
        event,
        hint,
      );

      return event;
    });
  }
}
