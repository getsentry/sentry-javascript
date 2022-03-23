import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, ExtendedError, Integration } from '@sentry/types';
import { isInstanceOf, resolvedSyncPromise, SyncPromise } from '@sentry/utils';

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
      return resolvedSyncPromise(event);
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
  private async _walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): Promise<Exception[]> {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return Promise.resolve(stack);
    }

    const exception = exceptionFromError(error[key]);

    // If the ContextLines integration is enabled, we add source code context to linked errors
    // because we can't guarantee the order that integrations are run.
    const contextLines = getCurrentHub().getIntegration(ContextLines);
    if (contextLines && exception.stacktrace?.frames) {
      await contextLines.addSourceContextToFrames(exception.stacktrace.frames);
    }

    return new Promise<Exception[]>((resolve, reject) => {
      void this._walkErrorTree(error[key], key, [exception, ...stack])
        .then(resolve)
        .then(null, () => {
          reject();
        });
    });
  }
}
