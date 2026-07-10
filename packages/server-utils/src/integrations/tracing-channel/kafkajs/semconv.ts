/*
 * Unstable OTel semantic-convention keys/values without a `@sentry/conventions` constant, inlined to
 * keep this integration free of `@opentelemetry/*` deps. Values are byte-identical to the vendored OTel
 * instrumentation (`@sentry/node`'s `integrations/tracing/kafka/vendored/semconv.ts`) for span parity.
 */

export const ATTR_MESSAGING_DESTINATION_PARTITION_ID = 'messaging.destination.partition.id' as const;
export const ATTR_MESSAGING_KAFKA_MESSAGE_KEY = 'messaging.kafka.message.key' as const;
export const ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE = 'messaging.kafka.message.tombstone' as const;
export const ATTR_MESSAGING_KAFKA_OFFSET = 'messaging.kafka.offset' as const;
export const MESSAGING_OPERATION_TYPE_VALUE_PROCESS = 'process' as const;
export const MESSAGING_OPERATION_TYPE_VALUE_RECEIVE = 'receive' as const;
export const MESSAGING_OPERATION_TYPE_VALUE_SEND = 'send' as const;
export const MESSAGING_SYSTEM_VALUE_KAFKA = 'kafka' as const;

// `_OTHER` is OTel's fallback bucket when no more specific `error.type` is known.
export const ERROR_TYPE_VALUE_OTHER = '_OTHER' as const;
