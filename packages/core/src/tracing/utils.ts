import type { Scope } from '../scope';
import type { Span } from '../types-hoist/span';
import { addNonEnumerableProperty } from '../utils/object';
import { GLOBAL_OBJ } from '../utils/worldwide';

const SCOPE_ON_START_SPAN_FIELD = '_sentryScope';
const ISOLATION_SCOPE_ON_START_SPAN_FIELD = '_sentryIsolationScope';

type ScopeWeakRef = { deref(): Scope | undefined } | Scope;

type SpanWithScopes = Span & {
  [SCOPE_ON_START_SPAN_FIELD]?: Scope;
  [ISOLATION_SCOPE_ON_START_SPAN_FIELD]?: ScopeWeakRef;
};

/** Wrap a scope with a WeakRef if available, falling back to a direct scope. */
function wrapScopeWithWeakRef(scope: Scope): ScopeWeakRef {
  try {
    // @ts-expect-error - WeakRef is not available in all environments
    const WeakRefClass = GLOBAL_OBJ.WeakRef;
    if (typeof WeakRefClass === 'function') {
      return new WeakRefClass(scope);
    }
  } catch {
    // WeakRef not available or failed to create
    // We'll fall back to a direct scope
  }

  return scope;
}

/** Try to unwrap a scope from a potential WeakRef wrapper. */
function unwrapScopeFromWeakRef(scopeRef: ScopeWeakRef | undefined): Scope | undefined {
  if (!scopeRef) {
    return undefined;
  }

  if (typeof scopeRef === 'object' && 'deref' in scopeRef && typeof scopeRef.deref === 'function') {
    try {
      return scopeRef.deref();
    } catch {
      return undefined;
    }
  }

  // Fallback to a direct scope
  return scopeRef as Scope;
}

/** Store the scope & isolation scope for a span, which can the be used when it is finished. */
export function setCapturedScopesOnSpan(span: Span | undefined, scope: Scope, isolationScope: Scope): void {
  if (span) {
    addNonEnumerableProperty(span, ISOLATION_SCOPE_ON_START_SPAN_FIELD, wrapScopeWithWeakRef(isolationScope));
    // We don't wrap the scope with a WeakRef here because webkit aggressively garbage collects
    // and scopes are not held in memory for long periods of time.
    addNonEnumerableProperty(span, SCOPE_ON_START_SPAN_FIELD, scope);
  }
}

/**
 * Grabs the scope and isolation scope off a span that were active when the span was started.
 * If WeakRef was used and scopes have been garbage collected, returns undefined for those scopes.
 */
export function getCapturedScopesOnSpan(span: Span): { scope?: Scope; isolationScope?: Scope } {
  const spanWithScopes = span as SpanWithScopes;

  return {
    scope: spanWithScopes[SCOPE_ON_START_SPAN_FIELD],
    isolationScope: unwrapScopeFromWeakRef(spanWithScopes[ISOLATION_SCOPE_ON_START_SPAN_FIELD]),
  };
}
