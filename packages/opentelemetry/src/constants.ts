import { createContextKey } from '@opentelemetry/api';

export const SENTRY_TRACE_HEADER = 'sentry-trace';
export const SENTRY_BAGGAGE_HEADER = 'baggage';
export const SENTRY_TRACE_STATE_DSC = 'sentry.trace';
export const SENTRY_TRACE_STATE_PARENT_SPAN_ID = 'sentry.parent_span_id';

/** Context Key to hold a Hub. */
export const SENTRY_HUB_CONTEXT_KEY = createContextKey('sentry_hub');

export const SENTRY_SCOPES_CONTEXT_KEY = createContextKey('sentry_scopes');

export const SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_isolation_scope');

export const SENTRY_FORK_SET_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_scope');

export const SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_isolation_scope');
