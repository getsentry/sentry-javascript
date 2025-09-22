import type { Client, IntegrationFn, SeverityLevel, Span } from '@sentry/core';
import { captureException, consoleSandbox, defineIntegration, getClient, withActiveSpan } from '@sentry/core';
import { logAndExitProcess } from '../utils/errorhandling';

type UnhandledRejectionMode = 'none' | 'warn' | 'strict';

type IgnoreMatcher = { symbol: symbol } | { name?: string | RegExp; message?: string | RegExp };

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
    name: 'AI_NoOutputGeneratedError', // When stream aborts in Vercel AI SDK, flush() fails with an error
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
function extractErrorInfo(reason: unknown): { name: string; message: string; isObject: boolean } {
  const isObject = reason !== null && typeof reason === 'object';
  if (!isObject) {
    return { name: '', message: String(reason ?? ''), isObject };
  }

  const errorLike = reason as Record<string, unknown>;
  const name = typeof errorLike.name === 'string' ? errorLike.name : '';
  const message = typeof errorLike.message === 'string' ? errorLike.message : String(reason);

  return { name, message, isObject };
}

/** Check if a matcher matches the reason */
function checkMatcher(
  matcher: IgnoreMatcher,
  reason: unknown,
  errorInfo: ReturnType<typeof extractErrorInfo>,
): boolean {
  if ('symbol' in matcher) {
    return errorInfo.isObject && matcher.symbol in (reason as object);
  }

  // name/message matcher
  const nameMatches =
    matcher.name === undefined ||
    (typeof matcher.name === 'string' ? errorInfo.name === matcher.name : matcher.name.test(errorInfo.name));

  const messageMatches =
    matcher.message === undefined ||
    (typeof matcher.message === 'string'
      ? errorInfo.message.includes(matcher.message)
      : matcher.message.test(errorInfo.message));

  return nameMatches && messageMatches;
}

/** Match helper */
function matchesIgnore(reason: unknown, list: IgnoreMatcher[]): boolean {
  const errorInfo = extractErrorInfo(reason);
  return list.some(matcher => checkMatcher(matcher, reason, errorInfo));
}

/** Core handler */
export function makeUnhandledPromiseHandler(
  client: Client,
  options: OnUnhandledRejectionOptions,
): (reason: unknown, promise: unknown) => void {
  return function sendUnhandledPromise(reason: unknown, promise: unknown): void {
    // Only handle for the active client
    if (getClient() !== client) return;

    // Skip if configured to ignore
    if (matchesIgnore(reason, options.ignore ?? [])) return;

    const level: SeverityLevel = options.mode === 'strict' ? 'fatal' : 'error';

    // If upstream code stored an active span on the error, use it for linking.
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
