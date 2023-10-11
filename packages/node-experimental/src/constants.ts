import { createContextKey } from '@opentelemetry/api';

export const OTEL_CONTEXT_HUB_KEY = createContextKey('sentry_hub');

export const OTEL_ATTR_ORIGIN = 'sentry.origin';
export const OTEL_ATTR_OP = 'sentry.op';
export const OTEL_ATTR_SOURCE = 'sentry.source';

export const OTEL_ATTR_PARENT_SAMPLED = 'sentry.parentSampled';

export const OTEL_ATTR_BREADCRUMB_TYPE = 'sentry.breadcrumb.type';
export const OTEL_ATTR_BREADCRUMB_LEVEL = 'sentry.breadcrumb.level';
export const OTEL_ATTR_BREADCRUMB_EVENT_ID = 'sentry.breadcrumb.event_id';
export const OTEL_ATTR_BREADCRUMB_CATEGORY = 'sentry.breadcrumb.category';
export const OTEL_ATTR_BREADCRUMB_DATA = 'sentry.breadcrumb.data';
export const OTEL_ATTR_SENTRY_SAMPLE_RATE = 'sentry.sample_rate';
