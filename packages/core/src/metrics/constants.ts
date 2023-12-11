export const COUNTER_METRIC_TYPE = 'c';
export const GAUGE_METRIC_TYPE = 'g';
export const SET_METRIC_TYPE = 's';
export const DISTRIBUTION_METRIC_TYPE = 'd';

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
 * Normalization regex for metric tag balues.
 *
 * This enforces that values only contain words, digits, or the following
 * special characters: _:/@.{}[\]$-
 *
 * See: https://develop.sentry.dev/sdk/metrics/#normalization
 */
export const TAG_VALUE_NORMALIZATION_REGEX = /[^\w\d_:/@.{}[\]$-]+/g;

export const DEFAULT_FLUSH_INTERVAL = 5000;
