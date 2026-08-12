import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToStaticSpanJSON } from '@sentry/core';
import type { MutableRootSpan } from '../../server/enhanceHandleRequestRootSpan';

/**
 * Adapts a live `Span` to the `MutableRootSpan` shape the root-span enhancers operate on.
 *
 * The enhancers run in a `spanEnd` hook (before the span is serialized/frozen), so their writes flow
 * into both the legacy transaction event and the streamed span JSON without a separate code path.
 *
 * `setName` is deliberately not `span.updateName()`: `updateName` stamps `sentry.source: 'custom'` as a
 * side effect, which would clobber the source the enhancers set (or a `route`/`url` source hoisted at
 * span start). We preserve the current source across the rename so only explicit source writes take effect.
 */
export function createLiveRootSpanAdapter(span: Span): MutableRootSpan {
  const attributes = spanToStaticSpanJSON(span).data;
  return {
    attributes,
    getName: () => spanToStaticSpanJSON(span).description,
    setName: (name: string) => {
      const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
      span.updateName(name);
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, source);
    },
    setOp: (op: string) => {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, op);
    },
  };
}
