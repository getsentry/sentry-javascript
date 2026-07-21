/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - Merged the upstream `semconv.ts` and `semconv-obsolete.ts` into a single file containing only the
 *   constants this instrumentation emits. These mirror the (now legacy) messaging semantic conventions
 *   that the SDK has always emitted; the `@deprecated` annotations were dropped since these vendored
 *   copies are intentionally the chosen output and we don't want to flag every usage site.
 */

/** A string identifying the kind of message consumption. */
export const ATTR_MESSAGING_OPERATION = 'messaging.operation' as const;

/** The message destination name (the exchange for amqplib). */
export const ATTR_MESSAGING_DESTINATION = 'messaging.destination' as const;

/** The kind of message destination. */
export const ATTR_MESSAGING_DESTINATION_KIND = 'messaging.destination_kind' as const;

/** RabbitMQ message routing key. */
export const ATTR_MESSAGING_RABBITMQ_ROUTING_KEY = 'messaging.rabbitmq.routing_key' as const;

/** The name of the transport protocol. */
export const ATTR_MESSAGING_PROTOCOL = 'messaging.protocol' as const;

/** The version of the transport protocol. */
export const ATTR_MESSAGING_PROTOCOL_VERSION = 'messaging.protocol_version' as const;

/** Connection string. */
export const ATTR_MESSAGING_URL = 'messaging.url' as const;

/** A value used by the messaging system as an identifier for the message, represented as a string. */
export const OLD_ATTR_MESSAGING_MESSAGE_ID = 'messaging.message_id' as const;

/** The conversation ID (a.k.a. correlation ID) identifying the conversation the message belongs to. */
export const ATTR_MESSAGING_CONVERSATION_ID = 'messaging.conversation_id' as const;

/** Value for `messaging.destination_kind` when the destination is a topic. */
export const MESSAGING_DESTINATION_KIND_VALUE_TOPIC = 'topic' as const;

/** Value for `messaging.operation` when the message is being processed by a consumer. */
export const MESSAGING_OPERATION_VALUE_PROCESS = 'process' as const;
