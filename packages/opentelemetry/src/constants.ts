import type { TraceState as TraceStateInterface } from '@opentelemetry/api';
import { createContextKey } from '@opentelemetry/api';
import type { DynamicSamplingContext } from '@sentry/core';
import { DSC_TRACE_STATE_KEYS, DSC_TRACE_STATE_PREFIX, _getDscFromTraceState } from '@sentry/core';

export { DSC_TRACE_STATE_PREFIX as SENTRY_TRACE_STATE_DSC_PREFIX };
export { _getDscFromTraceState as getDscFromTraceState };

export const SENTRY_TRACE_HEADER = 'sentry-trace';
export const SENTRY_BAGGAGE_HEADER = 'baggage';

export const SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING = 'sentry-sampled_not_recording';
export const SENTRY_TRACE_STATE_URL = 'sentry-url';
export const SENTRY_TRACE_STATE_SAMPLE_RAND = 'sentry-sample_rand';
export const SENTRY_TRACE_STATE_SAMPLE_RATE = 'sentry-sample_rate';

/**
 *  A flag marking a context as ignored because the span associated with the context
 *  is ignored (`ignoreSpans` filter).
 */
export const SENTRY_TRACE_STATE_CHILD_IGNORED = 'sentry-ignored';

/**
 *  A flag marking a segment span as ignored because it matched the `ignoreSpans` filter.
 *  Unlike `SENTRY_TRACE_STATE_CHILD_IGNORED` (used for child spans), this flag is NOT consumed
 *  by the context manager for re-parenting. Instead, it propagates to child spans so they
 *  can record the correct client report outcome (`ignored` instead of `sample_rate`).
 */
export const SENTRY_TRACE_STATE_SEGMENT_IGNORED = 'sentry-segment_ignored';

export function _setDscOnTraceState<T extends TraceStateInterface>(
  traceState: T,
  dsc: Partial<DynamicSamplingContext>,
): T {
  let ts: TraceStateInterface = traceState;
  for (const key of DSC_TRACE_STATE_KEYS) {
    const value = dsc[key];
    if (value) {
      ts = ts.set(`${DSC_TRACE_STATE_PREFIX}${key}`, encodeURIComponent(value));
    }
  }
  return ts as T;
}

export const SENTRY_SCOPES_CONTEXT_KEY = createContextKey('sentry_scopes');

export const SENTRY_FORK_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_isolation_scope');

export const SENTRY_FORK_SET_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_scope');

export const SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY = createContextKey('sentry_fork_set_isolation_scope');
