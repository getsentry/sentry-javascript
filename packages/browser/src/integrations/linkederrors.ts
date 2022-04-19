import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, EventHint, Exception, ExtendedError, Integration, StackParser } from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';

import { BrowserClient } from '../client';
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
  public setupOnce(): void {
    const client = getCurrentHub().getClient<BrowserClient>();
    const options = client && client.getOptions();
    if (!options) {
      return;
    }
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      return self ? _handler(options.stackParser, self._key, self._limit, event, hint) : event;
    });
  }
}

/**
 * @inheritDoc
 */
export function _handler(
  parser: StackParser,
  key: string,
  limit: number,
  event: Event,
  hint?: EventHint,
): Event | null {
  if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
    return event;
  }
  const linkedErrors = _walkErrorTree(parser, limit, hint.originalException as ExtendedError, key);
  event.exception.values = [...linkedErrors, ...event.exception.values];
  return event;
}

/**
 * JSDOC
 */
export function _walkErrorTree(
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  key: string,
  stack: Exception[] = [],
): Exception[] {
  if (!isInstanceOf(error[key], Error) || stack.length + 1 >= limit) {
    return stack;
  }
  const exception = exceptionFromError(parser, error[key]);
  return _walkErrorTree(parser, limit, error[key], key, [exception, ...stack]);
}
