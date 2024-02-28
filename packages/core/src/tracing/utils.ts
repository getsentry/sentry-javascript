import type { Span, Transaction } from '@sentry/types';
import type { Scope } from '@sentry/types';
import { addNonEnumerableProperty } from '@sentry/utils';
import { getCurrentScope } from '../currentScopes';

import type { Hub } from '../hub';
import { getCurrentHub } from '../hub';

/**
 * Grabs active transaction off scope.
 *
 * @deprecated You should not rely on the transaction, but just use `startSpan()` APIs instead.
 */
export function getActiveTransaction<T extends Transaction>(maybeHub?: Hub): T | undefined {
  // eslint-disable-next-line deprecation/deprecation
  const hub = maybeHub || getCurrentHub();
  // eslint-disable-next-line deprecation/deprecation
  const scope = hub.getScope();
  // eslint-disable-next-line deprecation/deprecation
  return scope.getTransaction() as T | undefined;
}

// so it can be used in manual instrumentation without necessitating a hard dependency on @sentry/utils
export { stripUrlQueryAndFragment } from '@sentry/utils';

/**
 * Returns the currently active span.
 */
export function getActiveSpan(): Span | undefined {
  // eslint-disable-next-line deprecation/deprecation
  return getCurrentScope().getSpan();
}

const CHILD_SPANS_FIELD = '_sentryChildSpans';

type SpanWithPotentialChildren = Span & {
  [CHILD_SPANS_FIELD]?: Set<Span>;
};

/**
 * Adds an opaque child span reference to a span.
 */
export function addChildSpanToSpan(span: SpanWithPotentialChildren, childSpan: Span): void {
  if (span[CHILD_SPANS_FIELD] && span[CHILD_SPANS_FIELD].size < 1000) {
    span[CHILD_SPANS_FIELD].add(childSpan);
  } else {
    span[CHILD_SPANS_FIELD] = new Set([childSpan]);
  }
}

/**
 * Obtains the entire span tree, meaning a span + all of its descendants for a particular span.
 */
export function getSpanTree(span: SpanWithPotentialChildren): Span[] {
  const resultSet = new Set<Span>();

  function addSpanChildren(span: SpanWithPotentialChildren): void {
    // This exit condition is required to not infinitely loop in case of a circular dependency.
    if (resultSet.has(span)) {
      return;
    } else {
      resultSet.add(span);
      const childSpans = span[CHILD_SPANS_FIELD] ? Array.from(span[CHILD_SPANS_FIELD]) : [];
      for (const childSpan of childSpans) {
        addSpanChildren(childSpan);
      }
    }
  }

  addSpanChildren(span);

  return Array.from(resultSet);
}

const SCOPE_ON_START_SPAN_FIELD = '_sentryScope';
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = '_sentryIsolationScope';

type SpanWithScopes = Span & {
  [SCOPE_ON_START_SPAN_FIELD]?: Scope;
  [ISOLATION_SCOPE_ON_START_SPAN_FIELD]?: Scope;
};

/** Store the scope & isolation scope for a span, which can the be used when it is finished. */
export function setCapturedScopesOnSpan(span: Span | undefined, scope: Scope, isolationScope: Scope): void {
  if (span) {
    addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, isolationScope);
    addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
  }
}

/**
 * Grabs the scope and isolation scope off a span that were active when the span was started.
 */
export function getCapturedScopesOnSpan(span: Span): { scope?: Scope; isolationScope?: Scope } {
  return {
    scope: (span as SpanWithScopes)[SCOPE_ON_START_SPAN_FIELD],
    isolationScope: (span as SpanWithScopes)[ISOLATION_SCOPE_ON_START_SPAN_FIELD],
  };
}
