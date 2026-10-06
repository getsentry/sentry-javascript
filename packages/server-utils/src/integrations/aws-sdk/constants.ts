/**
 * AWS-specific span constants used by the aws-sdk channel integration that are NOT covered by
 * `@sentry/conventions/attributes` (attribute names that exist there are imported from there
 * directly). These are either Sentry-specific (the span origin) or attribute *values* (not keys).
 */

/** The span origin every aws-sdk channel span carries. */
export const AWS_SDK_ORIGIN = 'auto.aws.aws_sdk';

/** DynamoDB `db.system.name` value (an attribute value, not a key, so not covered by conventions). */
export const DB_SYSTEM_VALUE_DYNAMODB = 'dynamodb';

/** SNS `messaging.destination_kind` value (an attribute value, not a key, so not covered by conventions). */
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic';

// Bedrock (gen_ai) attribute values (not keys, so not covered by conventions)
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat';
export const GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT = 'generate_content';
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock';
