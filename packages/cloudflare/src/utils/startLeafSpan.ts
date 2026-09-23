import type { Span, StartSpanOptions } from '@sentry/core';
import {
  _INTERNAL_recordEscapedErrorSpan,
  handleCallbackErrors,
  SPAN_STATUS_ERROR,
  spanToStaticSpanJSON,
  startInactiveSpan,
} from '@sentry/core';

/**
 * Like `startSpan`, but the span is not set as the active span while `callback` runs.
 *
 * `startSpan` forks the scope and enters a new async context twice per span. Binding calls
 * (storage, SQL, R2, D1, queues) run only native code in `callback`, which can never start a child
 * span, so that work is skipped here. Error handling matches `startSpan`: an escaped error sets
 * `internal_error` and is attributed to this span.
 *
 * Do not use it when `callback` runs user code, since spans started there would not be children of this span.
 */
export function startLeafSpan<T>(options: StartSpanOptions, callback: (span: Span) => T): T {
  const span = startInactiveSpan(options);

  return handleCallbackErrors(
    () => callback(span),
    error => {
      _INTERNAL_recordEscapedErrorSpan(error, span);
      if (span.isRecording() && spanToStaticSpanJSON(span).status === 'ok') {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      }
    },
    () => span.end(),
  );
}
