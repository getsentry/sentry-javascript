import { DEBUG_BUILD } from '../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '../semanticAttributes';
import type { ClientOptions } from '../types-hoist/options';
import type { SpanJSON, SpanV2JSON } from '../types-hoist/span';
import { debug } from './debug-logger';
import { isMatchingPattern } from './string';

function logIgnoredSpan(spanName: string, spanOp: string | undefined): void {
  debug.log(`Ignoring span ${spanOp ? `${spanOp} - ` : ''}${spanName} because it matches \`ignoreSpans\`.`);
}

/**
 * Check if a span should be ignored based on the ignoreSpans configuration.
 */
export function shouldIgnoreSpan(
  span: Pick<SpanJSON, 'description' | 'op'> | Pick<SpanV2JSON, 'name' | 'attributes'>,
  ignoreSpans: Required<ClientOptions>['ignoreSpans'],
): boolean {
  if (!ignoreSpans?.length) {
    return false;
  }

  const { spanName, spanOp: spanOpAttributeOrString } =
    'description' in span
      ? { spanName: span.description, spanOp: span.op }
      : 'name' in span
        ? { spanName: span.name, spanOp: span.attributes?.[SEMANTIC_ATTRIBUTE_SENTRY_OP] }
        : { spanName: '', spanOp: '' };

  const spanOp =
    typeof spanOpAttributeOrString === 'string'
      ? spanOpAttributeOrString
      : spanOpAttributeOrString?.type === 'string'
        ? spanOpAttributeOrString.value
        : undefined;

  if (!spanName) {
    return false;
  }

  for (const pattern of ignoreSpans) {
    if (isStringOrRegExp(pattern)) {
      if (isMatchingPattern(spanName, pattern)) {
        DEBUG_BUILD && logIgnoredSpan(spanName, spanOp);
        return true;
      }
      continue;
    }

    if (!pattern.name && !pattern.op) {
      continue;
    }

    const nameMatches = pattern.name ? isMatchingPattern(spanName, pattern.name) : true;
    const opMatches = pattern.op ? spanOp && isMatchingPattern(spanOp, pattern.op) : true;

    // This check here is only correct because we can guarantee that we ran `isMatchingPattern`
    // for at least one of `nameMatches` and `opMatches`. So in contrary to how this looks,
    // not both op and name actually have to match. This is the most efficient way to check
    // for all combinations of name and op patterns.
    if (nameMatches && opMatches) {
      DEBUG_BUILD && logIgnoredSpan(spanName, spanOp);
      return true;
    }
  }

  return false;
}

/**
 * Takes a list of spans, and a span that was dropped, and re-parents the child spans of the dropped span to the parent of the dropped span, if possible.
 * This mutates the spans array in place!
 */
export function reparentChildSpans(
  spans: Pick<SpanV2JSON, 'parent_span_id' | 'span_id'>[],
  dropSpan: Pick<SpanV2JSON, 'parent_span_id' | 'span_id'>,
): void {
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
