import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Integration, SentryEvent, SentryEventHint, SentryException } from '@sentry/types';
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
    addGlobalEventProcessor((event: SentryEvent, hint?: SentryEventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      if (self) {
        return (self.handler(event, hint) as unknown) as Promise<SentryEvent | null>;
      }
      return event;
    });
  }

  /**
   * @inheritDoc
   */
  public handler(event: SentryEvent, hint?: SentryEventHint): SyncPromise<SentryEvent | null> {
    if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
      return SyncPromise.resolve(event);
    }

    return new SyncPromise<SentryEvent | null>(resolve => {
      this.walkErrorTree(hint.originalException as ExtendedError, this.key).then((linkedErrors: SentryException[]) => {
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
  public walkErrorTree(
    error: ExtendedError,
    key: string,
    stack: SentryException[] = [],
  ): SyncPromise<SentryException[]> {
    if (!(error[key] instanceof Error) || stack.length + 1 >= this.limit) {
      return SyncPromise.resolve(stack);
    }
    return new SyncPromise<SentryException[]>(resolve => {
      getExceptionFromError(error[key]).then((exception: SentryException) => {
        this.walkErrorTree(error[key], key, [exception, ...stack]).then(resolve);
      });
    });
  }
}
