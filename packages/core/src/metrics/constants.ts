export const COUNTER_METRIC_TYPE = 'c';
export const GAUGE_METRIC_TYPE = 'g';
export const SET_METRIC_TYPE = 's';
export const DISTRIBUTION_METRIC_TYPE = 'd';

export const NAME_AND_TAG_KEY_REGEX = /[^a-zA-Z0-9_/.-]+"/g;
export const TAG_VALUE_REGEX = /[^\w\d_:/@.{}[\]$-]+/g;
