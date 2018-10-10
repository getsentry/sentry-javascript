import { getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent, SentryEventHint, SentryException } from '@sentry/types';
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
  public readonly name: string = 'LinkedErrors';

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
  public install(): void {
    getCurrentHub().configureScope(scope => {
      scope.addEventProcessor(this.handler.bind(this));
    });
  }

  /**
   * @inheritDoc
   */
  public async handler(event: SentryEvent, hint?: SentryEventHint): Promise<SentryEvent | null> {
    if (!event.exception || !event.exception.values || !hint || !(hint.originalException instanceof Error)) {
      return event;
    }
    const linkedErrors = await this.walkErrorTree(hint.originalException, this.key);
    event.exception.values = [...event.exception.values, ...linkedErrors];
    return event;
  }

  /**
   * @inheritDoc
   */
  public async walkErrorTree(
    error: ExtendedError,
    key: string,
    stack: SentryException[] = [],
  ): Promise<SentryException[]> {
    if (!(error[key] instanceof Error) || stack.length >= this.limit) {
      return stack;
    }
    const exception = await getExceptionFromError(error[key]);
    return this.walkErrorTree(error[key], key, [...stack, exception]);
  }
}
