import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, Integration } from '@sentry/types';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { getExceptionFromError } from '../parsers';

const DEFAULT_KEY = 'cause';
const DEFAULT_LIMIT = 5;

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: any;
}

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
  private readonly key: string;

  /**
   * @inheritDoc
   */
  private readonly limit: number;

  /**
   * @inheritDoc
   */
  public constructor(options: { key?: string; limit?: number } = {}) {
    this.key = options.key || DEFAULT_KEY;
    this.limit = options.limit || DEFAULT_LIMIT;
  }

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      if (self) {
        return (self.handler(event, hint) as unknown) as Promise<Event | null>;
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public handler(event: Event, hint?: EventHint): SyncPromise<Event | null> {
    if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
      return SyncPromise.resolve(event);
    }

    return new SyncPromise<Event | null>(resolve => {
      this.walkErrorTree(hint.originalException as ExtendedError, this.key).then((linkedErrors: Exception[]) => {
        if (event && event.exception) {
          event.exception.values = [...linkedErrors, ...event.exception.values];
        }
        resolve(event);
      });
    });
  }

  /**
   * @inheritDoc
   */
  public walkErrorTree(error: ExtendedError, key: string, stack: Exception[] = []): SyncPromise<Exception[]> {
    if (!(error[key] instanceof Error) || stack.length + 1 >= this.limit) {
      return SyncPromise.resolve(stack);
    }
    return new SyncPromise<Exception[]>(resolve => {
      getExceptionFromError(error[key]).then((exception: Exception) => {
        this.walkErrorTree(error[key], key, [exception, ...stack]).then(resolve);
      });
    });
  }
}
