import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, ExtendedError, Integration } from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';

import { exceptionFromError } from '../parsers';

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
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      return self ? _handler(self._key, self._limit, event, hint) : event;
    });
  }
}

/**
 * @inheritDoc
 */
export function _handler(key: string, limit: number, event: Event, hint?: EventHint): Event | null {
  if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
    return event;
  }
  const linkedErrors = _walkErrorTree(limit, hint.originalException as ExtendedError, key);
  event.exception.values = [...linkedErrors, ...event.exception.values];
  return event;
}

/**
 * JSDOC
 */
export function _walkErrorTree(limit: number, error: ExtendedError, key: string, stack: Exception[] = []): Exception[] {
  if (!isInstanceOf(error[key], Error) || stack.length + 1 >= limit) {
    return stack;
  }
  const exception = exceptionFromError(error[key]);
  return _walkErrorTree(limit, error[key], key, [exception, ...stack]);
}
