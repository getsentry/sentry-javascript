import { Integration, SentryEvent, SentryEventHint, SentryException } from '@sentry/types';
import { getCurrentHub } from '../hub';
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
  public name: string = 'LinkedErrors';

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly options: {
      key: string;
      limit: number;
    } = {
      key: DEFAULT_KEY,
      limit: DEFAULT_LIMIT,
    },
  ) {}

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
    const linkedErrors = await this.walkErrorTree(hint.originalException, this.options.key);
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
    if (!(error[key] instanceof Error) || stack.length >= this.options.limit) {
      return stack;
    }
    const exception = await getExceptionFromError(error[key]);
    return this.walkErrorTree(error[key], key, [...stack, exception]);
  }
}
