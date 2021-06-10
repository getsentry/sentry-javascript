import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, ExtendedError, Integration } from '@sentry/types';
import { isInstanceOf, SyncPromise } from '@sentry/utils';

import { getExceptionFromError } from '../parsers';

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
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      if (self) {
        const handler = self._handler && self._handler.bind(self);
        return typeof handler === 'function' ? handler(event, hint) : event;
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  private _handler(event: Event, hint?: EventHint): PromiseLike<Event> {
    if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
      return SyncPromise.resolve(event);
    }

    return new SyncPromise<Event>(resolve => {
      void this._walkErrorTree(hint.originalException as Error, this._key)
        .then((linkedErrors: Exception[]) => {
          if (event && event.exception && event.exception.values) {
            event.exception.values = [...linkedErrors, ...event.exception.values];
          }
          resolve(event);
        })
        .then(null, () => {
          resolve(event);
        });
    });
  }

  /**
   * @inheritDoc
   */
  private _walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): PromiseLike<Exception[]> {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return SyncPromise.resolve(stack);
    }
    return new SyncPromise<Exception[]>((resolve, reject) => {
      void getExceptionFromError(error[key])
        .then((exception: Exception) => {
          void this._walkErrorTree(error[key], key, [exception, ...stack])
            .then(resolve)
            .then(null, () => {
              reject();
            });
        })
        .then(null, () => {
          reject();
        });
    });
  }
}
