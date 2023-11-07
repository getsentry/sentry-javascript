/**
 * These are internal and are not supposed to be used/depended on by external parties.
 * No guarantees apply to these attributes, and the may change/disappear at any time.
 */
export const InternalSentrySemanticAttributes = {
  ORIGIN: 'sentry.origin',
  OP: 'sentry.op',
  SOURCE: 'sentry.source',
  SAMPLE_RATE: 'sentry.sample_rate',
  PARENT_SAMPLED: 'sentry.parentSampled',
  BREADCRUMB_TYPE: 'sentry.breadcrumb.type',
  BREADCRUMB_LEVEL: 'sentry.breadcrumb.level',
  BREADCRUMB_EVENT_ID: 'sentry.breadcrumb.event_id',
  BREADCRUMB_CATEGORY: 'sentry.breadcrumb.category',
  BREADCRUMB_DATA: 'sentry.breadcrumb.data',
} as const;
