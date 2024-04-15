import { createContextKey } from '@opentelemetry/api';

export const SENTRY_TRACE_HEADER = 'sentry-trace';
export const SENTRY_BAGGAGE_HEADER = 'baggage';

export const SENTRY_TRACE_STATE_DSC = 'sentry.dsc';
export const SENTRY_TRACE_STATE_PARENT_SPAN_ID = 'sentry.parent_span_id';
export const SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING = 'sentry.sampled_not_recording';
export const SENTRY_TRACE_STATE_URL = 'sentry.url';

export const SENTRY_SCOPES_CONTEXT_KEY = createContextKey('sentry_scopes');

export const SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_isolation_scope');

export const SENTRY_FORK_SET_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_scope');

export const SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_isolation_scope');
