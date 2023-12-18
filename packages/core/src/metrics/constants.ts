export const COUNTER_METRIC_TYPE = 'c' as const;
export const GAUGE_METRIC_TYPE = 'g' as const;
export const SET_METRIC_TYPE = 's' as const;
export const DISTRIBUTION_METRIC_TYPE = 'd' as const;

/**
 * Normalization regex for metric names and metric tag names.
 *
 * This enforces that names and tag keys only contain alphanumeric characters,
 * underscores, forward slashes, periods, and dashes.
 *
 * See: https://develop.sentry.dev/sdk/metrics/#normalization
 */
export const NAME_AND_TAG_KEY_NORMALIZATION_REGEX = /[^a-zA-Z0-9_/.-]+/g;

/**
 * Normalization regex for metric tag values.
 *
 * This enforces that values only contain words, digits, or the following
 * special characters: _:/@.{}[\]$-
 *
 * See: https://develop.sentry.dev/sdk/metrics/#normalization
 */
export const TAG_VALUE_NORMALIZATION_REGEX = /[^\w\d_:/@.{}[\]$-]+/g;

/**
 * This does not match spec in https://develop.sentry.dev/sdk/metrics
 * but was chosen to optimize for the most common case in browser environments.
 */
export const DEFAULT_FLUSH_INTERVAL = 5000;
