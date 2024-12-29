/**
 * Use this attribute to represent the source of a span.
 * Should be one of: custom, url, route, view, component, task, unknown
 *
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_SOURCE = 'sentry.source';

/**
 * Use this attribute to represent the sample rate used for a span.
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE = 'sentry.sample_rate';

/**
 * Use this attribute to represent the operation of a span.
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_OP = 'sentry.op';

/**
 * Use this attribute to represent the origin of a span.
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = 'sentry.origin';

/** The reason why an idle span finished. */
export const SEMANTIC_ATTRIBUTE_SENTRY_IDLE_SPAN_FINISH_REASON = 'sentry.idle_span_finish_reason';

/** The unit of a measurement, which may be stored as a TimedEvent. */
export const SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT = 'sentry.measurement_unit';

/** The value of a measurement, which may be stored as a TimedEvent. */
export const SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE = 'sentry.measurement_value';

/**
 * A custom span name set by users guaranteed to be taken over any automatically
 * inferred name. This attribute is removed before the span is sent.
 *
 * @internal only meant for internal SDK usage
 * @hidden
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME = 'sentry.custom_span_name';

/**
 * The id of the profile that this span occurred in.
 */
export const SEMANTIC_ATTRIBUTE_PROFILE_ID = 'sentry.profile_id';

export const SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME = 'sentry.exclusive_time';

export const SEMANTIC_ATTRIBUTE_CACHE_HIT = 'cache.hit';

export const SEMANTIC_ATTRIBUTE_CACHE_KEY = 'cache.key';

export const SEMANTIC_ATTRIBUTE_CACHE_ITEM_SIZE = 'cache.item_size';

/** TODO: Remove these once we update to latest semantic conventions */
export const SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD = 'http.request.method';
export const SEMANTIC_ATTRIBUTE_URL_FULL = 'url.full';
