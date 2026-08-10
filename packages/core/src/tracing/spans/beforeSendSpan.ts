import { DEBUG_BUILD } from '../../debug-build';
import type { StreamedSpanJSON } from '../../types/span';
import { consoleSandbox, debug } from '../../utils/debug-logger';

let hasShownSpanDropWarning = false;
/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export function applyBeforeSendSpanCallback<T extends StreamedSpanJSON>(span: T, beforeSendSpan: (span: T) => T): T {
  try {
    const modifedSpan = beforeSendSpan(span);
    if (!modifedSpan) {
      if (!hasShownSpanDropWarning) {
        consoleSandbox(() => {
          // eslint-disable-next-line no-console
          console.warn(
            '[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`.',
          );
        });
        hasShownSpanDropWarning = true;
      }
      return span;
    }
    return modifedSpan;
  } catch (error) {
    // Spans are captured synchronously when they end, so a throwing callback would otherwise
    // propagate into whatever user code ended the span.
    DEBUG_BUILD && debug.error('The `beforeSendSpan` callback threw an error, sending the span unmodified:', error);
    return span;
  }
}
