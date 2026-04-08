import type { Client, IntegrationFn, SeverityLevel, Span } from '@sentry/core';
import {
  captureException,
  consoleSandbox,
  defineIntegration,
  getClient,
  isMatchingPattern,
  withActiveSpan,
} from '@sentry/core';
import { logAndExitProcess } from '../utils/errorhandling';

type UnhandledRejectionMode = 'none' | 'warn' | 'strict';

type IgnoreMatcher = { name?: string | RegExp; message?: string | RegExp };

interface OnUnhandledRejectionOptions {
  /**
   * Option deciding what to do after capturing unhandledRejection,
   * that mimicks behavior of node's --unhandled-rejection flag.
   */
  mode: UnhandledRejectionMode;
  /** Rejection Errors to ignore (don't capture or warn). */
  ignore?: IgnoreMatcher[];
}

const INTEGRATION_NAME = 'OnUnhandledRejection';

const DEFAULT_IGNORES: IgnoreMatcher[] = [
  {
    name: 'AI_NoOutputGeneratedError', // When stream aborts in Vercel AI SDK V5, Vercel flush() fails with an error
  },
  {
    name: 'AbortError', // When stream aborts in Vercel AI SDK V6
  },
];

const _onUnhandledRejectionIntegration = ((options: Partial<OnUnhandledRejectionOptions> = {}) => {
  const opts: OnUnhandledRejectionOptions = {
    mode: options.mode ?? 'warn',
    ignore: [...DEFAULT_IGNORES, ...(options.ignore ?? [])],
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      global.process.on('unhandledRejection', makeUnhandledPromiseHandler(client, opts));
    },
  };
}) satisfies IntegrationFn;

export const onUnhandledRejectionIntegration = defineIntegration(_onUnhandledRejectionIntegration);

/** Extract error info safely */
function extractErrorInfo(reason: unknown): { name: string; message: string } {
  // Check if reason is an object (including Error instances, not just plain objects)
  if (typeof reason !== 'object' || reason === null) {
    return { name: '', message: String(reason ?? '') };
  }

  const errorLike = reason as Record<string, unknown>;
  const name = typeof errorLike.name === 'string' ? errorLike.name : '';
  const message = typeof errorLike.message === 'string' ? errorLike.message : String(reason);

  return { name, message };
}

/** Check if a matcher matches the reason */
function isMatchingReason(matcher: IgnoreMatcher, errorInfo: ReturnType<typeof extractErrorInfo>): boolean {
  // name/message matcher
  const nameMatches = matcher.name === undefined || isMatchingPattern(errorInfo.name, matcher.name, true);

  const messageMatches = matcher.message === undefined || isMatchingPattern(errorInfo.message, matcher.message);

  return nameMatches && messageMatches;
}

/** Match helper */
function matchesIgnore(list: IgnoreMatcher[], reason: unknown): boolean {
  const errorInfo = extractErrorInfo(reason);
  return list.some(matcher => isMatchingReason(matcher, errorInfo));
}

/** Core handler */
export function makeUnhandledPromiseHandler(
  client: Client,
  options: OnUnhandledRejectionOptions,
): (reason: unknown, promise: unknown) => void {
  return function sendUnhandledPromise(reason: unknown, promise: unknown): void {
    // Only handle for the active client
    if (getClient() !== client) {
      return;
    }

    // Skip if configured to ignore
    if (matchesIgnore(options.ignore ?? [], reason)) {
      return;
    }

    const level: SeverityLevel = options.mode === 'strict' ? 'fatal' : 'error';

    // this can be set in places where we cannot reliably get access to the active span/error
    // when the error bubbles up to this handler, we can use this to set the active span
    const activeSpanForError =
      reason && typeof reason === 'object' ? (reason as { _sentry_active_span?: Span })._sentry_active_span : undefined;

    const activeSpanWrapper = activeSpanForError
      ? (fn: () => void) => withActiveSpan(activeSpanForError, fn)
      : (fn: () => void) => fn();

    activeSpanWrapper(() => {
      captureException(reason, {
        originalException: promise,
        captureContext: {
          extra: { unhandledPromiseRejection: true },
          level,
        },
        mechanism: {
          handled: false,
          type: 'auto.node.onunhandledrejection',
        },
      });
    });

    handleRejection(reason, options.mode);
  };
}

/**
 * Handler for `mode` option
 */
function handleRejection(reason: unknown, mode: UnhandledRejectionMode): void {
  // https://github.com/nodejs/node/blob/7cf6f9e964aa00772965391c23acda6d71972a9a/lib/internal/process/promises.js#L234-L240
  const rejectionWarning =
    'This error originated either by ' +
    'throwing inside of an async function without a catch block, ' +
    'or by rejecting a promise which was not handled with .catch().' +
    ' The promise rejected with the reason:';

  /* eslint-disable no-console */
  if (mode === 'warn') {
    consoleSandbox(() => {
      console.warn(rejectionWarning);
      console.error(reason && typeof reason === 'object' && 'stack' in reason ? reason.stack : reason);
    });
  } else if (mode === 'strict') {
    consoleSandbox(() => {
      console.warn(rejectionWarning);
    });
    logAndExitProcess(reason);
  }
  /* eslint-enable no-console */
}
