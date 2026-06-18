/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 */
/* eslint-disable */

/**
 * The message destination name. This might be equal to the span name but is required nevertheless.
 *
 * @deprecated Use ATTR_MESSAGING_DESTINATION_NAME in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const ATTR_MESSAGING_DESTINATION = 'messaging.destination' as const;

/**
 * The kind of message destination.
 *
 * @deprecated Removed in semconv v1.20.0.
 */
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind' as const;

/**
 * RabbitMQ message routing key.
 *
 * @deprecated Use ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const ATTR_MESSAGING_RABBITMQ_ROUTING_KEY = 'messaging.rabbitmq.routing_key' as const;

/**
 * A string identifying the kind of message consumption as defined in the [Operation names](#operation-names) section above. If the operation is &#34;send&#34;, this attribute MUST NOT be set, since the operation can be inferred from the span kind in that case.
 *
 * @deprecated Use MESSAGING_OPERATION_TYPE_VALUE_PROCESS in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const MESSAGING_OPERATION_VALUE_PROCESS = 'process' as const;

/**
 * The name of the transport protocol.
 *
 * @deprecated Use ATTR_NETWORK_PROTOCOL_NAME.
 */
export const ATTR_MESSAGING_PROTOCOL = 'messaging.protocol' as const;

/**
 * The version of the transport protocol.
 *
 * @deprecated Use ATTR_NETWORK_PROTOCOL_VERSION.
 */
export const ATTR_MESSAGING_PROTOCOL_VERSION = 'messaging.protocol_version' as const;

/**
 * Connection string.
 *
 * @deprecated Removed in semconv v1.17.0.
 */
export const ATTR_MESSAGING_URL = 'messaging.url' as const;

/**
 * The kind of message destination.
 *
 * @deprecated Removed in semconv v1.20.0.
 */
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic' as const;

/**
 * A value used by the messaging system as an identifier for the message, represented as a string.
 *
 * @deprecated Use ATTR_MESSAGING_MESSAGE_ID in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 *
 * Note: changing to `ATTR_MESSAGING_MESSAGE_ID` means a change in value from `messaging.message_id` to `messaging.message.id`.
 */
export const OLD_ATTR_MESSAGING_MESSAGE_ID = 'messaging.message_id' as const;

/**
 * The [conversation ID](#conversations) identifying the conversation to which the message belongs, represented as a string. Sometimes called &#34;Correlation ID&#34;.
 *
 * @deprecated Use ATTR_MESSAGING_MESSAGE_CONVERSATION_ID in [incubating entry-point]({@link https://github.com/open-telemetry/opentelemetry-js/blob/main/semantic-conventions/README.md#unstable-semconv}).
 */
export const ATTR_MESSAGING_CONVERSATION_ID = 'messaging.conversation_id' as const;
