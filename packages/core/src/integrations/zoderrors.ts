import { defineIntegration } from '../integration';
import type { Event, EventHint } from '../types-hoist/event';
import type { IntegrationFn } from '../types-hoist/integration';
import { isError } from '../utils/is';
import { truncate } from '../utils/string';

interface ZodErrorsOptions {
  key?: string;
  /**
   * Limits the number of Zod errors inlined in each Sentry event.
   *
   * @default 10
   */
  limit?: number;
  /**
   * Save full list of Zod issues as an attachment in Sentry
   *
   * @default false
   */
  saveZodIssuesAsAttachment?: boolean;
}

const DEFAULT_LIMIT = 10;
const INTEGRATION_NAME = 'ZodErrors';

/**
 * Simplified ZodIssue type definition
 */
interface ZodIssue {
  path: (string | number)[];
  message?: string;
  expected?: unknown;
  received?: unknown;
  unionErrors?: unknown[];
  keys?: unknown[];
  invalid_literal?: unknown;
}

interface ZodError extends Error {
  issues: ZodIssue[];
}

function originalExceptionIsZodError(originalException: unknown): originalException is ZodError {
  return (
    isError(originalException) &&
    originalException.name === 'ZodError' &&
    Array.isArray((originalException as ZodError).issues)
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
 * that is preserved when sent to Sentry.
 *
 * Without this, we end up with something like this in Sentry:
 *
 * [
 *  [Object],
 *  [Object],
 *  [Object],
 *  [Object]
 * ]
 */
export function flattenIssue(issue: ZodIssue): SingleLevelZodIssue<ZodIssue> {
  return {
    ...issue,
    path: 'path' in issue && Array.isArray(issue.path) ? issue.path.join('.') : undefined,
    keys: 'keys' in issue ? JSON.stringify(issue.keys) : undefined,
    unionErrors: 'unionErrors' in issue ? JSON.stringify(issue.unionErrors) : undefined,
  };
}

/**
 * Takes ZodError issue path array and returns a flattened version as a string.
 * This makes it easier to display paths within a Sentry error message.
 *
 * Array indexes are normalized to reduce duplicate entries
 *
 * @param path ZodError issue path
 * @returns flattened path
 *
 * @example
 * flattenIssuePath([0, 'foo', 1, 'bar']) // -> '<array>.foo.<array>.bar'
 */
export function flattenIssuePath(path: Array<string | number>): string {
  return path
    .map(p => {
      if (typeof p === 'number') {
        return '<array>';
      } else {
        return p;
      }
    })
    .join('.');
}

/**
 * Zod error message is a stringified version of ZodError.issues
 * This doesn't display well in the Sentry UI. Replace it with something shorter.
 */
export function formatIssueMessage(zodError: ZodError): string {
  const errorKeyMap = new Set<string | number | symbol>();
  for (const iss of zodError.issues) {
    const issuePath = flattenIssuePath(iss.path);
    if (issuePath.length > 0) {
      errorKeyMap.add(issuePath);
    }
  }

  const errorKeys = Array.from(errorKeyMap);
  if (errorKeys.length === 0) {
    // If there are no keys, then we're likely validating the root
    // variable rather than a key within an object. This attempts
    // to extract what type it was that failed to validate.
    // For example, z.string().parse(123) would return "string" here.
    let rootExpectedType = 'variable';
    if (zodError.issues.length > 0) {
      const iss = zodError.issues[0];
      if (iss !== undefined && 'expected' in iss && typeof iss.expected === 'string') {
        rootExpectedType = iss.expected;
      }
    }
    return `Failed to validate ${rootExpectedType}`;
  }
  return `Failed to validate keys: ${truncate(errorKeys.join(', '), 100)}`;
}

/**
 * Applies ZodError issues to an event extra and replaces the error message
 */
export function applyZodErrorsToEvent(
  limit: number,
  saveZodIssuesAsAttachment: boolean = false,
  event: Event,
  hint: EventHint,
): Event {
  if (
    !event.exception?.values ||
    !hint.originalException ||
    !originalExceptionIsZodError(hint.originalException) ||
    hint.originalException.issues.length === 0
  ) {
    return event;
  }

  try {
    const issuesToFlatten = saveZodIssuesAsAttachment
      ? hint.originalException.issues
      : hint.originalException.issues.slice(0, limit);
    const flattenedIssues = issuesToFlatten.map(flattenIssue);

    if (saveZodIssuesAsAttachment) {
      // Sometimes having the full error details can be helpful.
      // Attachments have much higher limits, so we can include the full list of issues.
      if (!Array.isArray(hint.attachments)) {
        hint.attachments = [];
      }
      hint.attachments.push({
        filename: 'zod_issues.json',
        data: JSON.stringify({
          issues: flattenedIssues,
        }),
      });
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
        'zoderror.issues': flattenedIssues.slice(0, limit),
      },
    };
  } catch (e) {
    // Hopefully we never throw errors here, but record it
    // with the event just in case.
    return {
      ...event,
      extra: {
        ...event.extra,
        'zoderrors sentry integration parse error': {
          message: 'an exception was thrown while processing ZodError within applyZodErrorsToEvent()',
          error: e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : 'unknown',
        },
      },
    };
  }
}

const _zodErrorsIntegration = ((options: ZodErrorsOptions = {}) => {
  const limit = options.limit ?? DEFAULT_LIMIT;

  return {
    name: INTEGRATION_NAME,
    processEvent(originalEvent, hint): Event {
      const processedEvent = applyZodErrorsToEvent(limit, options.saveZodIssuesAsAttachment, originalEvent, hint);
      return processedEvent;
    },
  };
}) satisfies IntegrationFn;

/**
 * Sentry integration to process Zod errors, making them easier to work with in Sentry.
 */
export const zodErrorsIntegration = defineIntegration(_zodErrorsIntegration);
