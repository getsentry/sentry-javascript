import type { IntegrationFn } from '@sentry/types';
import type { Event, EventHint } from '@sentry/types';
import { isError, truncate } from '@sentry/utils';
import { defineIntegration } from '../integration';

interface ZodErrorsOptions {
  key?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const INTEGRATION_NAME = 'ZodErrors';

// Simplified ZodIssue type definition
interface ZodIssue {
  path: (string | number)[];
  message?: string;
  expected?: string | number;
  received?: string | number;
  unionErrors?: unknown[];
  keys?: unknown[];
}

interface ZodError extends Error {
  issues: ZodIssue[];

  get errors(): ZodError['issues'];
}

function originalExceptionIsZodError(originalException: unknown): originalException is ZodError {
  return (
    isError(originalException) &&
    originalException.name === 'ZodError' &&
    Array.isArray((originalException as ZodError).errors)
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
  const errorKeyMap = new Set<string | number | symbol>();
  for (const iss of zodError.issues) {
    if (iss.path && iss.path[0]) {
      errorKeyMap.add(iss.path[0]);
    }
  }
  const errorKeys = Array.from(errorKeyMap);

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

const _zodErrorsIntegration = ((options: ZodErrorsOptions = {}) => {
  const limit = options.limit || DEFAULT_LIMIT;

  return {
    name: INTEGRATION_NAME,
    processEvent(originalEvent, hint) {
      const processedEvent = applyZodErrorsToEvent(limit, originalEvent, hint);
      return processedEvent;
    },
  };
}) satisfies IntegrationFn;

export const zodErrorsIntegration = defineIntegration(_zodErrorsIntegration);
