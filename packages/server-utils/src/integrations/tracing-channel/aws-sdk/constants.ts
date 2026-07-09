/**
 * AWS-specific span attribute names used by the aws-sdk channel integration.
 *
 * These mirror the constants the OTel `@opentelemetry/instrumentation-aws-sdk` emits (some are
 * unstable/obsolete OTel semantic conventions with no `ATTR_*` export in
 * `@opentelemetry/semantic-conventions`), inlined here so the integration stays free of OTel deps.
 * Standard conventions (`rpc.*`, `db.*`, `messaging.*`, `gen_ai.*`, …) come from
 * `@sentry/conventions/attributes` directly.
 */

/** The span origin every aws-sdk channel span carries, mirroring the uniform OTel `auto.otel.aws`. */
export const AWS_SDK_ORIGIN = 'auto.aws.orchestrion.aws-sdk';

export const ATTR_RPC_SYSTEM = 'rpc.system';
export const CLOUD_REGION = 'cloud.region';
export const AWS_REQUEST_ID = 'aws.request.id';
export const AWS_REQUEST_EXTENDED_ID = 'aws.request.extended_id';
export const AWS_S3_BUCKET = 'aws.s3.bucket';
export const AWS_KINESIS_STREAM_NAME = 'aws.kinesis.stream.name';

// DynamoDB
export const ATTR_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS = 'aws.dynamodb.attribute_definitions';
export const ATTR_AWS_DYNAMODB_CONSISTENT_READ = 'aws.dynamodb.consistent_read';
export const ATTR_AWS_DYNAMODB_CONSUMED_CAPACITY = 'aws.dynamodb.consumed_capacity';
export const ATTR_AWS_DYNAMODB_COUNT = 'aws.dynamodb.count';
export const ATTR_AWS_DYNAMODB_EXCLUSIVE_START_TABLE = 'aws.dynamodb.exclusive_start_table';
export const ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES = 'aws.dynamodb.global_secondary_indexes';
export const ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES = 'aws.dynamodb.global_secondary_index_updates';
export const ATTR_AWS_DYNAMODB_INDEX_NAME = 'aws.dynamodb.index_name';
export const ATTR_AWS_DYNAMODB_ITEM_COLLECTION_METRICS = 'aws.dynamodb.item_collection_metrics';
export const ATTR_AWS_DYNAMODB_LIMIT = 'aws.dynamodb.limit';
export const ATTR_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES = 'aws.dynamodb.local_secondary_indexes';
export const ATTR_AWS_DYNAMODB_PROJECTION = 'aws.dynamodb.projection';
export const ATTR_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY = 'aws.dynamodb.provisioned_read_capacity';
export const ATTR_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY = 'aws.dynamodb.provisioned_write_capacity';
export const ATTR_AWS_DYNAMODB_SCANNED_COUNT = 'aws.dynamodb.scanned_count';
export const ATTR_AWS_DYNAMODB_SCAN_FORWARD = 'aws.dynamodb.scan_forward';
export const ATTR_AWS_DYNAMODB_SEGMENT = 'aws.dynamodb.segment';
export const ATTR_AWS_DYNAMODB_SELECT = 'aws.dynamodb.select';
export const ATTR_AWS_DYNAMODB_TABLE_COUNT = 'aws.dynamodb.table_count';
export const ATTR_AWS_DYNAMODB_TABLE_NAMES = 'aws.dynamodb.table_names';
export const ATTR_AWS_DYNAMODB_TOTAL_SEGMENTS = 'aws.dynamodb.total_segments';
export const DB_SYSTEM_VALUE_DYNAMODB = 'dynamodb';

// SecretsManager / SNS / StepFunctions
export const ATTR_AWS_SECRETSMANAGER_SECRET_ARN = 'aws.secretsmanager.secret.arn';
export const ATTR_AWS_SNS_TOPIC_ARN = 'aws.sns.topic.arn';
export const ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN = 'aws.step_functions.activity.arn';
export const ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN = 'aws.step_functions.state_machine.arn';

// Lambda (faas)
export const ATTR_FAAS_INVOKED_NAME = 'faas.invoked_name';
export const ATTR_FAAS_INVOKED_PROVIDER = 'faas.invoked_provider';
export const ATTR_FAAS_INVOKED_REGION = 'faas.invoked_region';
export const ATTR_FAAS_EXECUTION = 'faas.execution';

// Messaging (obsolete OTel conventions kept for parity with the OTel integration)
export const ATTR_MESSAGING_DESTINATION = 'messaging.destination';
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind';
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic';

// Bedrock (gen_ai)
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES = 'gen_ai.request.stop_sequences';
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat';
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock';
