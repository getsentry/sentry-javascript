export const COUNTER_METRIC_TYPE = 'c' as const;
export const GAUGE_METRIC_TYPE = 'g' as const;
export const SET_METRIC_TYPE = 's' as const;
export const DISTRIBUTION_METRIC_TYPE = 'd' as const;

/**
 * This does not match spec in https://develop.sentry.dev/sdk/metrics
 * but was chosen to optimize for the most common case in browser environments.
 */
export const DEFAULT_BROWSER_FLUSH_INTERVAL = 5000;

/**
 * SDKs are required to bucket into 10 second intervals (rollup in seconds)
 * which is the current lower bound of metric accuracy.
 */
export const DEFAULT_FLUSH_INTERVAL = 10000;

/**
 * The maximum number of metrics that should be stored in memory.
 */
export const MAX_WEIGHT = 10000;
