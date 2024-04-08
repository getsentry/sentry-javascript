import type { Scope } from '@sentry/types';
import { addNonEnumerableProperty } from '@sentry/utils';

import type { AbstractSpan } from '../types';

const SPAN_SCOPES_FIELD = '_spanScopes';

/**
 * Set the Sentry scope to be used for finishing a given OTEL span.
 * This is different from `setCapturedScopesOnSpan`, as that works on _sentry_ spans,
 * while here we are basically "caching" this on the otel spans.
 */
export function setSpanScopes(
  span: AbstractSpan,
  scopes: {
    scope: Scope;
    isolationScope: Scope;
  },
): void {
  addNonEnumerableProperty(span, SPAN_SCOPES_FIELD, scopes);
}

/** Get the Sentry scopes to use for finishing an OTEL span. */
export function getSpanScopes(span: AbstractSpan):
  | {
      scope: Scope;
      isolationScope: Scope;
    }
  | undefined {
  return (span as { [SPAN_SCOPES_FIELD]?: { scope: Scope; isolationScope: Scope } })[SPAN_SCOPES_FIELD];
}
