import type { Event, EventHint } from '@sentry/types';

import { isError } from './is';
import { truncate } from './string';

// Simplified ZodIssue type definition
interface ZodIssue {
  path: (string | number)[];
  message?: string;
  expected?: string | number;
  received?: string | number;
  unionErrors?: unknown[];
  keys?: unknown[];
}

interface FlattenedZodResult {
  formErrors: unknown[];
  fieldErrors: Record<string, unknown[]>;
}

interface ZodError extends Error {
  issues: ZodIssue[];

  get errors(): ZodError['issues'];
  flatten(): FlattenedZodResult;
}

function originalExceptionIsZodError(originalException: unknown): originalException is ZodError {
  return (
    isError(originalException) &&
    originalException.name === 'ZodError' &&
    Array.isArray((originalException as ZodError).errors) &&
    typeof (originalException as ZodError).flatten === 'function'
  );
}

type SingleLevelZodIssue<T extends ZodIssue> = {
  [P in keyof T]: T[P] extends string | number | undefined
    ? T[P]
    : T[P] extends unknown[]
      ? string | undefined
      : unknown;
};

/**
 * Formats child objects or arrays to a string
 * That is preserved when sent to Sentry
 */
function formatIssueTitle(issue: ZodIssue): SingleLevelZodIssue<ZodIssue> {
  return {
    ...issue,
    path: 'path' in issue && Array.isArray(issue.path) ? issue.path.join('.') : undefined,
    keys: 'keys' in issue ? JSON.stringify(issue.keys) : undefined,
    unionErrors: 'unionErrors' in issue ? JSON.stringify(issue.unionErrors) : undefined,
  };
}

/**
 * Zod error message is a stringified version of ZodError.issues
 * This doesn't display well in the Sentry UI. Replace it with something shorter.
 */
function formatIssueMessage(zodError: ZodError): string {
  const formError = zodError.flatten();
  const errorKeys = Object.keys(formError.fieldErrors);
  return `Failed to validate keys: ${truncate(errorKeys.join(', '), 100)}`;
}

/**
 * Applies ZodError issues to an event extras and replaces the error message
 */
export function applyZodErrorsToEvent(limit: number, event: Event, hint?: EventHint): Event {
  if (
    !event.exception ||
    !event.exception.values ||
    !hint ||
    !hint.originalException ||
    !originalExceptionIsZodError(hint.originalException) ||
    hint.originalException.issues.length === 0
  ) {
    return event;
  }

  return {
    ...event,
    exception: {
      ...event.exception,
      values: [
        {
          ...event.exception.values[0],
          value: formatIssueMessage(hint.originalException),
        },
        ...event.exception.values.slice(1),
      ],
    },
    extra: {
      ...event.extra,
      'zoderror.issues': hint.originalException.errors.slice(0, limit).map(formatIssueTitle),
    },
  };
}
