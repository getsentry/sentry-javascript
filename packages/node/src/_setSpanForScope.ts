import type { Scope, Span } from '@sentry/types';
import { addNonEnumerableProperty } from '@sentry/utils';

// This is inlined here from packages/core/src/utils/spanUtils.ts to avoid exporting this from there
// ------------------------

const SCOPE_SPAN_FIELD = '_sentrySpan';

type ScopeWithMaybeSpan = Scope & {
  [SCOPE_SPAN_FIELD]?: Span;
};

/**
 * Set the active span for a given scope.
 * NOTE: This should NOT be used directly, but is only used internally by the trace methods.
 */
export function _setSpanForScope(scope: Scope, span: Span | undefined): void {
  if (span) {
    addNonEnumerableProperty(scope as ScopeWithMaybeSpan, SCOPE_SPAN_FIELD, span);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (scope as ScopeWithMaybeSpan)[SCOPE_SPAN_FIELD];
  }
}
