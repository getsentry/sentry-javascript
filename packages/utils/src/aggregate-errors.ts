import type { Event, EventHint, Exception, ExtendedError, StackParser } from '@sentry/types';

import { isInstanceOf } from './is';

/**
 * Creates exceptions inside `event.exception.values` for errors that are nested on properties based on the `key` parameter.
 */
export function applyAggregateErrorsToEvent(
  exceptionFromErrorImplementation: (stackParser: StackParser, ex: Error) => Exception,
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
    exceptionFromErrorImplementation,
    parser,
    limit,
    hint.originalException as ExtendedError,
    key,
  );

  event.exception.values = [...linkedErrors, ...event.exception.values];

  return event;
}

function aggreagateExceptionsFromError(
  exceptionFromErrorImplementation: (stackParser: StackParser, ex: Error) => Exception,
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  key: string,
  stack: Exception[] = [],
): Exception[] {
  if (!isInstanceOf(error[key], Error) || stack.length >= limit) {
    return stack;
  }

  const exception = exceptionFromErrorImplementation(parser, error[key]);
  return aggreagateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, error[key], key, [
    exception,
    ...stack,
  ]);
}
