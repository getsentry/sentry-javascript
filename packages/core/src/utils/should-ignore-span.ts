import type { ClientOptions } from '../types-hoist/options';
import type { SpanJSON } from '../types-hoist/span';
import { isMatchingPattern, stringMatchesSomePattern } from './string';

/**
 * Check if a span should be ignored based on the ignoreSpans configuration.
 */
export function shouldIgnoreSpan(
  span: Pick<SpanJSON, 'description' | 'op'>,
  ignoreSpans: ClientOptions['ignoreSpans'],
): boolean {
  if (!ignoreSpans?.length) {
    return false;
  }

  if (!span.description) {
    return false;
  }

  // First we check the simple string/regex patterns - if the name matches any of them, we ignore the span
  const simplePatterns = ignoreSpans.filter(isStringOrRegExp);
  if (simplePatterns.length && stringMatchesSomePattern(span.description, simplePatterns)) {
    return true;
  }

  // Then we check the more complex patterns, where both parts must match
  for (const pattern of ignoreSpans) {
    // Have already checked for simple patterns, so we can skip these
    if (isStringOrRegExp(pattern) || (!pattern.name && !pattern.op)) {
      continue;
    }

    const nameMatches = pattern.name ? isMatchingPattern(span.description, pattern.name) : true;
    const opMatches = pattern.op ? span.op && isMatchingPattern(span.op, pattern.op) : true;

    if (nameMatches && opMatches) {
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
