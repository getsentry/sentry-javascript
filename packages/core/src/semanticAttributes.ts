/**
 * Use this attribute to represent the source of a span.
 * Should be one of: custom, url, route, view, component, task, unknown
 *
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_SOURCE = 'sentry.source';

/**
 * Attributes that holds the sample rate that was locally applied to a span.
 * If this attribute is not defined, it means that the span inherited a sampling decision.
 *
 * NOTE: Is only defined on root spans.
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE = 'sentry.sample_rate';

/**
 * Attribute holding the sample rate of the previous trace.
 * This is used to sample consistently across subsequent traces in the browser SDK.
 *
 * Note: Only defined on root spans, if opted into consistent sampling
 */
export const SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE = 'sentry.previous_trace_sample_rate';

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

/**
 * A span link attribute to mark the link as a special span link.
 *
 * Known values:
 * - `previous_trace`: The span links to the frontend root span of the previous trace.
 * - `next_trace`: The span links to the frontend root span of the next trace. (Not set by the SDK)
 *
 * Other values may be set as appropriate.
 * @see https://develop.sentry.dev/sdk/telemetry/traces/span-links/#link-types
 */
export const SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE = 'sentry.link.type';
