import type {
  DsnComponents,
  LogSeverityLevel,
  SdkMetadata,
  SerializedLogAttribute,
  SerializedOtelLog,
} from './types-hoist';
import type { OtelLogItem, OtelLogEnvelope } from './types-hoist/envelope';
import { createEnvelope, dsnToString } from './utils-hoist';

export const SEVERITY_TEXT_TO_SEVERITY_NUMBER: Partial<Record<LogSeverityLevel, number>> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

/**
 * Convert a log attribute to a serialized log attribute
 *
 * @param key - The key of the log attribute
 * @param value - The value of the log attribute
 * @returns The serialized log attribute
 */
export function logAttributeToSerializedLogAttribute(key: string, value: unknown): SerializedLogAttribute {
  switch (typeof value) {
    case 'number':
      return {
        key,
        value: { doubleValue: value },
      };
    case 'boolean':
      return {
        key,
        value: { boolValue: value },
      };
    case 'string':
      return {
        key,
        value: { stringValue: value },
      };
    default:
      return {
        key,
        value: { stringValue: JSON.stringify(value) ?? '' },
      };
  }
}

/**
 * Creates envelope item for a single log
 */
export function createOtelLogEnvelopeItem(log: SerializedOtelLog): OtelLogItem {
  const headers: OtelLogItem[0] = {
    type: 'otel_log',
  };

  return [headers, log];
}

/**
 * Records a log and sends it to sentry.
 *
 * Logs represent a message (and optionally some structured data) which provide context for a trace or error.
 * Ex: sentry.addLog({level: 'warning', message: `user ${user} just bought ${item}`, attributes: {user, item}}
 *
 * @params log - the log object which will be sent
 */
export function createOtelLogEnvelope(
  logs: Array<SerializedOtelLog>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
): OtelLogEnvelope {
  const headers: OtelLogEnvelope[0] = {};

  if (metadata?.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  return createEnvelope<OtelLogEnvelope>(headers, logs.map(createOtelLogEnvelopeItem));
}
