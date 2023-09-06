import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { applyAggregateErrorsToEvent } from '@sentry/utils';

import { exceptionFromError } from '../eventbuilder';

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
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    const client = getCurrentHub().getClient();
    if (client && client.on) {
      client.on('preprocessEvent', (event, hint) => {
        const hub = getCurrentHub();
        const client = hub.getClient();

        const self = hub.getIntegration(LinkedErrors);

        if (!client || !self) {
          return;
        }

        const options = client.getOptions();

        applyAggregateErrorsToEvent(
          exceptionFromError,
          options.stackParser,
          options.maxValueLength,
          self._key,
          self._limit,
          event,
          hint,
        );
      });
    }
  }
}
