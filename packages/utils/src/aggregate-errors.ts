import type { Exception, ExtendedError, StackParser } from '@sentry/types';

import { isInstanceOf } from './is';

/**
 * TODO
 */
export function aggreagateExceptionsFromError(
  exceptionFromErrorImplementation: (stackParser: StackParser, ex: Error) => Exception,
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  key: string,
  stack: Exception[] = [],
): Exception[] {
  if (!isInstanceOf(error[key], Error) || stack.length + 1 >= limit) {
    return stack;
  }

  const exception = exceptionFromErrorImplementation(parser, error[key]);
  return aggreagateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, error[key], key, [
    exception,
    ...stack,
  ]);
}
