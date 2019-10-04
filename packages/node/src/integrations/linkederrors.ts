import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, ExtendedError, Integration } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';

import { getExceptionFromError } from '../parsers';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

/** Adds SDK info to an event. */
export class LinkedErrors implements Integration {
  /**
   * @inheritDoc
   */
  public readonly name: string = LinkedErrors.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'LinkedErrors';

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
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      if (self) {
        return (self.handler(event, hint) as unknown) as Promise<Event>;
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public handler(event: Event, hint?: EventHint): Promise<Event> {
    if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
      return SyncPromise.resolve(event);
    }

    return new SyncPromise<Event>(resolve => {
      this.walkErrorTree(hint.originalException as ExtendedError, this._key)
        .then((linkedErrors: Exception[]) => {
          if (event && event.exception && event.exception.values) {
            event.exception.values = [...linkedErrors, ...event.exception.values];
          }
          resolve(event);
        })
        .catch(() => {
          resolve(event);
        });
    });
  }

  /**
   * @inheritDoc
   */
  public walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): Promise<Exception[]> {
    if (!(error[key] instanceof Error) || stack.length + 1 >= this._limit) {
      return SyncPromise.resolve(stack);
    }
    return new SyncPromise<Exception[]>((resolve, reject) => {
      getExceptionFromError(error[key])
        .then((exception: Exception) => {
          this.walkErrorTree(error[key], key, [exception, ...stack])
            .then(resolve)
            .catch(() => {
              reject();
            });
        })
        .catch(() => {
          reject();
        });
    });
  }
}
