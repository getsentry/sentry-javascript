import { DEBUG_BUILD } from '../debug-build';
import type { ClientOptions } from '../types-hoist/options';
import type { SpanJSON } from '../types-hoist/span';
import { debug } from './debug-logger';
import { isMatchingPattern } from './string';

function logIgnoredSpan(droppedSpan: Pick<SpanJSON, 'description' | 'op'>): void {
  debug.log(`Ignoring span ${droppedSpan.op} - ${droppedSpan.description} because it matches \`ignoreSpans\`.`);
}

/**
 * Check if a span should be ignored based on the ignoreSpans configuration.
 */
export function shouldIgnoreSpan(
  span: Pick<SpanJSON, 'description' | 'op'>,
  ignoreSpans: Required<ClientOptions>['ignoreSpans'],
): boolean {
  if (!ignoreSpans?.length || !span.description) {
    return false;
  }

  for (const pattern of ignoreSpans) {
    if (isStringOrRegExp(pattern)) {
      if (isMatchingPattern(span.description, pattern)) {
        DEBUG_BUILD && logIgnoredSpan(span);
        return true;
      }
      continue;
    }

    if (!pattern.name && !pattern.op) {
      continue;
    }

    const nameMatches = pattern.name ? isMatchingPattern(span.description, pattern.name) : true;
    const opMatches = pattern.op ? span.op && isMatchingPattern(span.op, pattern.op) : true;

    // This check here is only correct because we can guarantee that we ran `isMatchingPattern`
    // for at least one of `nameMatches` and `opMatches`. So in contrary to how this looks,
    // not both op and name actually have to match. This is the most efficient way to check
    // for all combinations of name and op patterns.
    if (nameMatches && opMatches) {
      DEBUG_BUILD && logIgnoredSpan(span);
      return true;
    }
  }

  return false;
}

/**
 * Takes a list of spans, and a span that was dropped, and re-parents the child spans of the dropped span to the parent of the dropped span, if possible.
 * This mutates the spans array in place!
 */
export function reparentChildSpans(spans: SpanJSON[], dropSpan: SpanJSON): void {
  const droppedSpanParentId = dropSpan.parent_span_id;
  const droppedSpanId = dropSpan.span_id;

  // This should generally not happen, as we do not apply this on root spans
  // but to be safe, we just bail in this case
  if (!droppedSpanParentId) {
    return;
  }

  for (const span of spans) {
    if (span.parent_span_id === droppedSpanId) {
      span.parent_span_id = droppedSpanParentId;
    }
  }
}

function isStringOrRegExp(value: unknown): value is string | RegExp {
  return typeof value === 'string' || value instanceof RegExp;
}
