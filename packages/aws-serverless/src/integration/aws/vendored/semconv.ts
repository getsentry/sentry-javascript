/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-aws-sdk
 * - Upstream version: @opentelemetry/instrumentation-aws-sdk@0.73.0
 */
/* eslint-disable */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The JSON-serialized value of each item in the `AttributeDefinitions` request field.
 *
 * @example ["{ "AttributeName": "string", "AttributeType": "string" }"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_ATTRIBUTE_DEFINITIONS = 'aws.dynamodb.attribute_definitions' as const;

/**
 * The value of the `ConsistentRead` request parameter.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_CONSISTENT_READ = 'aws.dynamodb.consistent_read' as const;

/**
 * The JSON-serialized value of each item in the `ConsumedCapacity` response field.
 *
 * @example ["{ "CapacityUnits": number, "GlobalSecondaryIndexes": { "string" : { "CapacityUnits": number, "ReadCapacityUnits": number, "WriteCapacityUnits": number } }, "LocalSecondaryIndexes": { "string" : { "CapacityUnits": number, "ReadCapacityUnits": number, "WriteCapacityUnits": number } }, "ReadCapacityUnits": number, "Table": { "CapacityUnits": number, "ReadCapacityUnits": number, "WriteCapacityUnits": number }, "TableName": "string", "WriteCapacityUnits": number }"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_CONSUMED_CAPACITY = 'aws.dynamodb.consumed_capacity' as const;

/**
 * The value of the `Count` response parameter.
 *
 * @example 10
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_COUNT = 'aws.dynamodb.count' as const;

/**
 * The value of the `ExclusiveStartTableName` request parameter.
 *
 * @example Users
 * @example CatsTable
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_EXCLUSIVE_START_TABLE = 'aws.dynamodb.exclusive_start_table' as const;

/**
 * The JSON-serialized value of each item of the `GlobalSecondaryIndexes` request field
 *
 * @example ["{ "IndexName": "string", "KeySchema": [ { "AttributeName": "string", "KeyType": "string" } ], "Projection": { "NonKeyAttributes": [ "string" ], "ProjectionType": "string" }, "ProvisionedThroughput": { "ReadCapacityUnits": number, "WriteCapacityUnits": number } }"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEXES = 'aws.dynamodb.global_secondary_indexes' as const;

/**
 * The JSON-serialized value of each item in the `GlobalSecondaryIndexUpdates` request field.
 *
 * @example ["{ "Create": { "IndexName": "string", "KeySchema": [ { "AttributeName": "string", "KeyType": "string" } ], "Projection": { "NonKeyAttributes": [ "string" ], "ProjectionType": "string" }, "ProvisionedThroughput": { "ReadCapacityUnits": number, "WriteCapacityUnits": number } }"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_GLOBAL_SECONDARY_INDEX_UPDATES = 'aws.dynamodb.global_secondary_index_updates' as const;

/**
 * The value of the `IndexName` request parameter.
 *
 * @example name_to_group
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_INDEX_NAME = 'aws.dynamodb.index_name' as const;

/**
 * The JSON-serialized value of the `ItemCollectionMetrics` response field.
 *
 * @example { "string" : [ { "ItemCollectionKey": { "string" : { "B": blob, "BOOL": boolean, "BS": [ blob ], "L": [ "AttributeValue" ], "M": { "string" : "AttributeValue" }, "N": "string", "NS": [ "string" ], "NULL": boolean, "S": "string", "SS": [ "string" ] } }, "SizeEstimateRangeGB": [ number ] } ] }
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_ITEM_COLLECTION_METRICS = 'aws.dynamodb.item_collection_metrics' as const;

/**
 * The value of the `Limit` request parameter.
 *
 * @example 10
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_LIMIT = 'aws.dynamodb.limit' as const;

/**
 * The JSON-serialized value of each item of the `LocalSecondaryIndexes` request field.
 *
 * @example ["{ "IndexArn": "string", "IndexName": "string", "IndexSizeBytes": number, "ItemCount": number, "KeySchema": [ { "AttributeName": "string", "KeyType": "string" } ], "Projection": { "NonKeyAttributes": [ "string" ], "ProjectionType": "string" } }"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_LOCAL_SECONDARY_INDEXES = 'aws.dynamodb.local_secondary_indexes' as const;

/**
 * The value of the `ProjectionExpression` request parameter.
 *
 * @example Title
 * @example Title, Price, Color
 * @example Title, Description, RelatedItems, ProductReviews
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_PROJECTION = 'aws.dynamodb.projection' as const;

/**
 * The value of the `ProvisionedThroughput.ReadCapacityUnits` request parameter.
 *
 * @example 1.0
 * @example 2.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_PROVISIONED_READ_CAPACITY = 'aws.dynamodb.provisioned_read_capacity' as const;

/**
 * The value of the `ProvisionedThroughput.WriteCapacityUnits` request parameter.
 *
 * @example 1.0
 * @example 2.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_PROVISIONED_WRITE_CAPACITY = 'aws.dynamodb.provisioned_write_capacity' as const;

/**
 * The value of the `ScannedCount` response parameter.
 *
 * @example 50
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_SCANNED_COUNT = 'aws.dynamodb.scanned_count' as const;

/**
 * The value of the `ScanIndexForward` request parameter.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_SCAN_FORWARD = 'aws.dynamodb.scan_forward' as const;

/**
 * The value of the `Segment` request parameter.
 *
 * @example 10
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_SEGMENT = 'aws.dynamodb.segment' as const;

/**
 * The value of the `Select` request parameter.
 *
 * @example ALL_ATTRIBUTES
 * @example COUNT
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_SELECT = 'aws.dynamodb.select' as const;

/**
 * The number of items in the `TableNames` response parameter.
 *
 * @example 20
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_TABLE_COUNT = 'aws.dynamodb.table_count' as const;

/**
 * The keys in the `RequestItems` object field.
 *
 * @example ["Users", "Cats"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_TABLE_NAMES = 'aws.dynamodb.table_names' as const;

/**
 * The value of the `TotalSegments` request parameter.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_DYNAMODB_TOTAL_SEGMENTS = 'aws.dynamodb.total_segments' as const;

/**
 * The ARN of the Secret stored in the Secrets Mangger
 *
 * @example arn:aws:secretsmanager:us-east-1:123456789012:secret:SecretName-6RandomCharacters
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_SECRETSMANAGER_SECRET_ARN = 'aws.secretsmanager.secret.arn' as const;

/**
 * The ARN of the AWS SNS Topic. An Amazon SNS [topic](https://docs.aws.amazon.com/sns/latest/dg/sns-create-topic.html) is a logical access point that acts as a communication channel.
 *
 * @example arn:aws:sns:us-east-1:123456789012:mystack-mytopic-NZJ5JSMVGFIE
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_SNS_TOPIC_ARN = 'aws.sns.topic.arn' as const;

/**
 * The ARN of the AWS Step Functions Activity.
 *
 * @example arn:aws:states:us-east-1:123456789012:activity:get-greeting
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_STEP_FUNCTIONS_ACTIVITY_ARN = 'aws.step_functions.activity.arn' as const;

/**
 * The ARN of the AWS Step Functions State Machine.
 *
 * @example arn:aws:states:us-east-1:123456789012:stateMachine:myStateMachine:1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_STEP_FUNCTIONS_STATE_MACHINE_ARN = 'aws.step_functions.state_machine.arn' as const;

/**
 * Deprecated, use `db.namespace` instead.
 *
 * @example customers
 * @example main
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.namespace`.
 */
export const ATTR_DB_NAME = 'db.name' as const;

/**
 * Deprecated, use `db.operation.name` instead.
 *
 * @example findAndModify
 * @example HMSET
 * @example SELECT
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.operation.name`.
 */
export const ATTR_DB_OPERATION = 'db.operation' as const;

/**
 * The database statement being executed.
 *
 * @example SELECT * FROM wuser_table
 * @example SET mykey "WuValue"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.query.text`.
 */
export const ATTR_DB_STATEMENT = 'db.statement' as const;

/**
 * Deprecated, use `db.system.name` instead.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.system.name`.
 */
export const ATTR_DB_SYSTEM = 'db.system' as const;

/**
 * The name of the invoked function.
 *
 * @example "my-function"
 *
 * @note **SHOULD** be equal to the `faas.name` resource attribute of the invoked function.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_INVOKED_NAME = 'faas.invoked_name' as const;

/**
 * The cloud provider of the invoked function.
 *
 * @note **SHOULD** be equal to the `cloud.provider` resource attribute of the invoked function.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_INVOKED_PROVIDER = 'faas.invoked_provider' as const;

/**
 * The cloud region of the invoked function.
 *
 * @example "eu-central-1"
 *
 * @note **SHOULD** be equal to the `cloud.region` resource attribute of the invoked function.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_INVOKED_REGION = 'faas.invoked_region' as const;

/**
 * The name of the operation being performed.
 *
 * @note If one of the predefined values applies, but specific system uses a different name it's **RECOMMENDED** to document it in the semantic conventions for specific GenAI system and use system-specific name in the instrumentation. If a different name is not documented, instrumentation libraries **SHOULD** use applicable predefined value.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const;

/**
 * The maximum number of tokens the model generates for a request.
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MAX_TOKENS = 'gen_ai.request.max_tokens' as const;

/**
 * The name of the GenAI model a request is being made to.
 *
 * @example "gpt-4"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const;

/**
 * List of sequences that the model will use to stop generating further tokens.
 *
 * @example ["forest", "lived"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES = 'gen_ai.request.stop_sequences' as const;

/**
 * The temperature setting for the GenAI request.
 *
 * @example 0.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TEMPERATURE = 'gen_ai.request.temperature' as const;

/**
 * The top_p sampling setting for the GenAI request.
 *
 * @example 1.0
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_REQUEST_TOP_P = 'gen_ai.request.top_p' as const;

/**
 * Array of reasons the model stopped generating tokens, corresponding to each generation received.
 *
 * @example ["stop"]
 * @example ["stop", "length"]
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = 'gen_ai.response.finish_reasons' as const;

/**
 * Deprecated, use `gen_ai.provider.name` instead.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `gen_ai.provider.name`.
 */
export const ATTR_GEN_AI_SYSTEM = 'gen_ai.system' as const;

/**
 * The type of token being counted.
 *
 * @example input
 * @example output
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_TOKEN_TYPE = 'gen_ai.token.type' as const;

/**
 * The number of tokens used in the GenAI input (prompt).
 *
 * @example 100
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens' as const;

/**
 * The number of tokens used in the GenAI response (completion).
 *
 * @example 180
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens' as const;

/**
 * Deprecated, use `http.response.status_code` instead.
 *
 * @example 200
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `http.response.status_code`.
 */
export const ATTR_HTTP_STATUS_CODE = 'http.status_code' as const;

/**
 * The number of messages sent, received, or processed in the scope of the batching operation.
 *
 * @example 0
 * @example 1
 * @example 2
 *
 * @note Instrumentations **SHOULD NOT** set `messaging.batch.message_count` on spans that operate with a single message. When a messaging client library supports both batch and single-message API for the same operation, instrumentations **SHOULD** use `messaging.batch.message_count` for batching APIs and **SHOULD NOT** use it for single-message APIs.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_BATCH_MESSAGE_COUNT = 'messaging.batch.message_count' as const;

/**
 * The message destination name
 *
 * @example MyQueue
 * @example MyTopic
 *
 * @note Destination name **SHOULD** uniquely identify a specific queue, topic or other entity within the broker. If
 * the broker doesn't have such notion, the destination name **SHOULD** uniquely identify the broker.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name' as const;

/**
 * A value used by the messaging system as an identifier for the message, represented as a string.
 *
 * @example "452a7c7c7c7048c2f887f61572b18fc2"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id' as const;

/**
 * Deprecated, use `messaging.operation.type` instead.
 *
 * @example publish
 * @example create
 * @example process
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `messaging.operation.type`.
 */
export const ATTR_MESSAGING_OPERATION = 'messaging.operation' as const;

/**
 * A string identifying the type of the messaging operation.
 *
 * @note If a custom value is used, it **MUST** be of low cardinality.
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_OPERATION_TYPE = 'messaging.operation.type' as const;

/**
 * The messaging system as identified by the client instrumentation.
 *
 * @note The actual messaging system may differ from the one known by the client. For example, when using Kafka client libraries to communicate with Azure Event Hubs, the `messaging.system` is set to `kafka` based on the instrumentation's best knowledge.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_SYSTEM = 'messaging.system' as const;

/**
 * The name of the (logical) method being called, must be equal to the $method part in the span name.
 *
 * @example "exampleMethod"
 *
 * @note This is the logical name of the method from the RPC interface perspective, which can be different from the name of any implementing method/function. The `code.function.name` attribute may be used to store the latter (e.g., method actually executing the call on the server side, RPC client stub method on the client side).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_RPC_METHOD = 'rpc.method' as const;

/**
 * The full (logical) name of the service being called, including its package name, if applicable.
 *
 * @example "myservice.EchoService"
 *
 * @note This is the logical name of the service from the RPC interface perspective, which can be different from the name of any implementing class. The `code.namespace` attribute may be used to store the latter (despite the attribute name, it may include a class name; e.g., class with method actually executing the call on the server side, RPC client stub class on the client side).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_RPC_SERVICE = 'rpc.service' as const;

/**
 * A string identifying the remoting system. See below for a list of well-known identifiers.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_RPC_SYSTEM = 'rpc.system' as const;

/**
 * Enum value "dynamodb" for attribute {@link ATTR_DB_SYSTEM}.
 *
 * Amazon DynamoDB
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `DB_SYSTEM_NAME_VALUE_DYNAMODB`.
 */
export const DB_SYSTEM_VALUE_DYNAMODB = 'dynamodb' as const;

/**
 * Enum value "dynamodb" for attribute ATTR_DB_SYSTEM_NAME.
 *
 * Amazon DynamoDB
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const DB_SYSTEM_NAME_VALUE_DYNAMODB = 'dynamodb' as const;

/**
 * Enum value "chat" for attribute {@link ATTR_GEN_AI_OPERATION_NAME}.
 *
 * Chat completion operation such as [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_OPERATION_NAME_VALUE_CHAT = 'chat' as const;

/**
 * Enum value "aws.bedrock" for attribute {@link ATTR_GEN_AI_SYSTEM}.
 *
 * AWS Bedrock
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_SYSTEM_VALUE_AWS_BEDROCK = 'aws.bedrock' as const;

/**
 * Enum value "input" for attribute {@link ATTR_GEN_AI_TOKEN_TYPE}.
 *
 * Input tokens (prompt, input, etc.)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_INPUT = 'input' as const;

/**
 * Enum value "output" for attribute {@link ATTR_GEN_AI_TOKEN_TYPE}.
 *
 * Output tokens (completion, response, etc.)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const GEN_AI_TOKEN_TYPE_VALUE_OUTPUT = 'output' as const;

/**
 * GenAI operation duration.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_CLIENT_OPERATION_DURATION = 'gen_ai.client.operation.duration' as const;

/**
 * Number of input and output tokens used.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_GEN_AI_CLIENT_TOKEN_USAGE = 'gen_ai.client.token.usage' as const;
