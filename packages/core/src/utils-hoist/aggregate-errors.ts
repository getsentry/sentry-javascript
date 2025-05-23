import type { ExtendedError } from '../types-hoist/error';
import type { Event, EventHint } from '../types-hoist/event';
import type { Exception } from '../types-hoist/exception';
import type { StackParser } from '../types-hoist/stacktrace';
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
): void {
  if (!event.exception?.values || !hint || !isInstanceOf(hint.originalException, Error)) {
    return;
  }

  // Generally speaking the last item in `event.exception.values` is the exception originating from the original Error
  const originalException: Exception | undefined =
    event.exception.values.length > 0 ? event.exception.values[event.exception.values.length - 1] : undefined;

  // We only create exception grouping if there is an exception in the event.
  if (originalException) {
    event.exception.values = aggregateExceptionsFromError(
      exceptionFromErrorImplementation,
      parser,
      limit,
      hint.originalException as ExtendedError,
      key,
      event.exception.values,
      originalException,
      0,
    );
  }
}

function aggregateExceptionsFromError(
  exceptionFromErrorImplementation: (stackParser: StackParser, ex: Error) => Exception,
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  key: string,
  prevExceptions: Exception[],
  exception: Exception,
  exceptionId: number,
): Exception[] {
  if (prevExceptions.length >= limit + 1) {
    return prevExceptions;
  }

  let newExceptions = [...prevExceptions];

  // Recursively call this function in order to walk down a chain of errors
  if (isInstanceOf(error[key], Error)) {
    applyExceptionGroupFieldsForParentException(exception, exceptionId);
    const newException = exceptionFromErrorImplementation(parser, error[key]);
    const newExceptionId = newExceptions.length;
    applyExceptionGroupFieldsForChildException(newException, key, newExceptionId, exceptionId);
    newExceptions = aggregateExceptionsFromError(
      exceptionFromErrorImplementation,
      parser,
      limit,
      error[key],
      key,
      [newException, ...newExceptions],
      newException,
      newExceptionId,
    );
  }

  // This will create exception grouping for AggregateErrors
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
  if (Array.isArray(error.errors)) {
    error.errors.forEach((childError, i) => {
      if (isInstanceOf(childError, Error)) {
        applyExceptionGroupFieldsForParentException(exception, exceptionId);
        const newException = exceptionFromErrorImplementation(parser, childError);
        const newExceptionId = newExceptions.length;
        applyExceptionGroupFieldsForChildException(newException, `errors[${i}]`, newExceptionId, exceptionId);
        newExceptions = aggregateExceptionsFromError(
          exceptionFromErrorImplementation,
          parser,
          limit,
          childError,
          key,
          [newException, ...newExceptions],
          newException,
          newExceptionId,
        );
      }
    });
  }

  return newExceptions;
}

function applyExceptionGroupFieldsForParentException(exception: Exception, exceptionId: number): void {
  // Don't know if this default makes sense. The protocol requires us to set these values so we pick *some* default.
  exception.mechanism = exception.mechanism || { type: 'generic', handled: true };

  exception.mechanism = {
    ...exception.mechanism,
    ...(exception.type === 'AggregateError' && { is_exception_group: true }),
    exception_id: exceptionId,
  };
}

function applyExceptionGroupFieldsForChildException(
  exception: Exception,
  source: string,
  exceptionId: number,
  parentId: number | undefined,
): void {
  // Don't know if this default makes sense. The protocol requires us to set these values so we pick *some* default.
  exception.mechanism = exception.mechanism || { type: 'generic', handled: true };

  exception.mechanism = {
    ...exception.mechanism,
    type: 'chained',
    source,
    exception_id: exceptionId,
    parent_id: parentId,
  };
}
