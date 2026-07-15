/**
 * AWS-specific span constants used by the aws-sdk channel integration that are NOT covered by
 * `@sentry/conventions/attributes` (attribute names that exist there are imported from there
 * directly). Per-service files append their own such constants below.
 */

/** The span origin every aws-sdk channel span carries, mirroring the uniform OTel `auto.otel.aws`. */
export const AWS_SDK_ORIGIN = 'auto.aws.orchestrion.aws_sdk';

/** DynamoDB `db.system` value (an attribute value, not a key, so not covered by conventions). */
export const DB_SYSTEM_VALUE_DYNAMODB = 'dynamodb';

// SNS
export const ATTR_AWS_SNS_TOPIC_ARN = 'aws.sns.topic.arn';

// Lambda (faas)
export const ATTR_FAAS_INVOKED_NAME = 'faas.invoked_name';
export const ATTR_FAAS_INVOKED_PROVIDER = 'faas.invoked_provider';
export const ATTR_FAAS_INVOKED_REGION = 'faas.invoked_region';
export const ATTR_FAAS_EXECUTION = 'faas.execution';

// Messaging (obsolete OTel conventions kept for parity with the OTel integration)
export const ATTR_MESSAGING_DESTINATION = 'messaging.destination';
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind';
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic';
