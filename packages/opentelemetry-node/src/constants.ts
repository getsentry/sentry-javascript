import { createContextKey } from '@opentelemetry/api';

export const SENTRY_TRACE_HEADER = 'sentry-trace';

export const SENTRY_BAGGAGE_HEADER = 'baggage';

export const SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY = createContextKey('SENTRY_DYNAMIC_SAMPLING_CONTEXT_KEY');

export const SENTRY_TRACE_PARENT_CONTEXT_KEY = createContextKey('SENTRY_TRACE_PARENT_CONTEXT_KEY');

export const SENTRY_CURRENT_TRANSACTION_CONTEXT_KEY = createContextKey('SENTRY_CURRENT_TRANSACTION_CONTEXT_KEY');
