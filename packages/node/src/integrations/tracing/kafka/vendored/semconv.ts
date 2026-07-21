/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 * - Metric semantic conventions dropped; `error.type` inlined from `@opentelemetry/semantic-conventions`
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The identifier of the partition messages are sent to or received from, unique within the `messaging.destination.name`.
 *
 * @example "1"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_DESTINATION_PARTITION_ID = 'messaging.destination.partition.id' as const;

/**
 * Message keys in Kafka are used for grouping alike messages to ensure they're processed on the same partition. They differ from `messaging.message.id` in that they're not unique. If the key is `null`, the attribute **MUST NOT** be set.
 *
 * @example "myKey"
 *
 * @note If the key type is not string, it's string representation has to be supplied for the attribute. If the key has no unambiguous, canonical string form, don't include its value.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_KAFKA_MESSAGE_KEY = 'messaging.kafka.message.key' as const;

/**
 * A boolean that is true if the message is a tombstone.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE = 'messaging.kafka.message.tombstone' as const;

/**
 * The offset of a record in the corresponding Kafka partition.
 *
 * @example 42
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_KAFKA_OFFSET = 'messaging.kafka.offset' as const;

/**
 * Enum value "process" for attribute `messaging.operation.type`.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_PROCESS = 'process' as const;

/**
 * Enum value "receive" for attribute `messaging.operation.type`.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_RECEIVE = 'receive' as const;

/**
 * Enum value "send" for attribute `messaging.operation.type`.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_SEND = 'send' as const;

/**
 * Enum value "kafka" for attribute `messaging.system`.
 */
export const MESSAGING_SYSTEM_VALUE_KAFKA = 'kafka' as const;

/**
 * Enum value "_OTHER" for attribute `error.type`. A fallback error value to be used when
 * the instrumentation doesn't define a custom value.
 */
export const ERROR_TYPE_VALUE_OTHER = '_OTHER' as const;
