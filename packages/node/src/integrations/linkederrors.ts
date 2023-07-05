import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import type { Event, EventHint, Exception, ExtendedError, Integration, StackParser } from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';

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
    addGlobalEventProcessor(async (event: Event, hint: EventHint) => {
      const hub = getCurrentHub();
      const self = hub.getIntegration(LinkedErrors);
      const client = hub.getClient();
      if (client && self && self._handler && typeof self._handler === 'function') {
        self._handler(client.getOptions().stackParser, event, hint);
      }

      // If the ContextLines integration is enabled, we add source code context to linked errors
      // because we can't guarantee the order that integrations are run.
      const contextLines = getCurrentHub().getIntegration(ContextLines);
      if (contextLines) {
        await contextLines.addSourceContext(event);
      }

      return event;
    });
  }

  /**
   * @inheritDoc
   */
  private _handler(stackParser: StackParser, event: Event, hint: EventHint): Event {
    if (!event.exception || !event.exception.values || !hint || !isInstanceOf(hint.originalException, Error)) {
      return event;
    }

    const linkedErrors = this._walkErrorTree(stackParser, hint.originalException as ExtendedError, this._key);
    event.exception.values = [...linkedErrors, ...event.exception.values];
    return event;
  }

  /**
   * @inheritDoc
   */
  private _walkErrorTree(
    stackParser: StackParser,
    error: ExtendedError,
    key: string,
    stack: Exception[] = [],
  ): Exception[] {
    if (!isInstanceOf(error[key], Error) || stack.length + 1 >= this._limit) {
      return stack;
    }

    const exception = exceptionFromError(stackParser, error[key]);

    return this._walkErrorTree(stackParser, error[key], key, [exception, ...stack]);
  }
}
