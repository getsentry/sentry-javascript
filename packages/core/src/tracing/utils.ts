import type { Client } from '../client';
import type { Scope } from '../scope';
import type { Span } from '../types-hoist/span';
import { extractOrgIdFromDsnHost } from '../utils-hoist/dsn';
import { addNonEnumerableProperty } from '../utils-hoist/object';

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

/**
 *  Returns the organization ID of the client.
 *
 *  The organization ID is extracted from the DSN. If the client options include a `orgId`, this will always take precedence.
 */
export function deriveOrgIdFromClient(client: Client | undefined): string | undefined {
  const options = client?.getOptions();

  const { host } = client?.getDsn() || {};

  let org_id: string | undefined;

  if (options?.orgId) {
    org_id = String(options.orgId);
  } else if (host) {
    org_id = extractOrgIdFromDsnHost(host);
  }

  return org_id;
}
