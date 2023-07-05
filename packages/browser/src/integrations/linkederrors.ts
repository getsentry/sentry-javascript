import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import type { Event, EventHint, ExtendedError, Integration, StackParser } from '@sentry/types';
import { aggreagateExceptionsFromError, isInstanceOf } from '@sentry/utils';

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
    const client = getCurrentHub().getClient();
    if (!client) {
      return;
    }
    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);
      return self ? _handler(client.getOptions().stackParser, self._key, self._limit, event, hint) : event;
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

  const linkedErrors = aggreagateExceptionsFromError(
    exceptionFromError,
    parser,
    limit,
    hint.originalException as ExtendedError,
    key,
  );

  event.exception.values = [...linkedErrors, ...event.exception.values];

  return event;
}
