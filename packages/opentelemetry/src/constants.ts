import { createContextKey } from '@opentelemetry/api';

export const SENTRY_TRACE_HEADER = 'sentry-trace';
export const SENTRY_BAGGAGE_HEADER = 'baggage';

/** Context Key to hold a PropagationContext. */
export const SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY = createContextKey('SENTRY_PROPAGATION_CONTEXT_CONTEXT_KEY');

/** Context Key to hold a Hub. */
export const SENTRY_HUB_CONTEXT_KEY = createContextKey('sentry_hub');

/** Context Key to hold a root scope. */
export const SENTRY_ROOT_SCOPE_CONTEXT_KEY = createContextKey('sentry_root_scope');

/** Context Key to force setting of the root scope, even if one already exists. */
export const SENTRY_FORCE_ROOT_SCOPE_CONTEXT_KEY = createContextKey('sentry_force_root_scope');
