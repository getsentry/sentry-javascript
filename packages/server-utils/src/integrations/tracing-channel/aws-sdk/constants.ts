/**
 * AWS-specific span constants used by the aws-sdk channel integration that are NOT covered by
 * `@sentry/conventions/attributes` (attribute names that exist there are imported from there
 * directly). These are either Sentry-specific (the span origin), attribute *values* (not keys), or
 * obsolete OTel conventions with no `@sentry/conventions` export.
 */

/** The span origin every aws-sdk channel span carries, mirroring the uniform OTel `auto.otel.aws`. */
export const AWS_SDK_ORIGIN = 'auto.aws.orchestrion.aws_sdk';

/** DynamoDB `db.system` value (an attribute value, not a key, so not covered by conventions). */
export const DB_SYSTEM_VALUE_DYNAMODB = 'dynamodb';

// Messaging (obsolete OTel convention with no `@sentry/conventions` export, kept for parity)
// TODO(v11): import from `@sentry/conventions` once a release including it ships (added in
// getsentry/sentry-conventions#509), and drop this local constant.
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind';
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic';
