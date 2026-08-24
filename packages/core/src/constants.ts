export const DEFAULT_ENVIRONMENT = 'production';
export const DEV_ENVIRONMENT = 'development';

/**
 * The name of a pageload span when span streaming is enabled and no parameterized route is
 * available. Span names have to be low cardinality, so a raw URL must never be used instead.
 *
 * This is a span name only: it must never be set as the scope's transaction name, which is what
 * error events are grouped by.
 */
export const PAGELOAD_SPAN_NAME_FALLBACK = 'Pageload';
