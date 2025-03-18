import type { Client } from '../client';
import { _getTraceInfoFromScope } from '../client';
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { SEVERITY_TEXT_TO_SEVERITY_NUMBER } from './constants';
import type { SerializedLogAttribute, SerializedOtelLog } from '../types-hoist';
import type { Log } from '../types-hoist/log';
import { logger } from '../utils-hoist';
import { _getSpanForScope } from '../utils/spanOnScope';
import { createOtelLogEnvelope } from './envelope';

const MAX_LOG_BUFFER_SIZE = 100;

const CLIENT_TO_LOG_BUFFER_MAP = new WeakMap<Client, Array<SerializedOtelLog>>();

/**
 * Converts a log attribute to a serialized log attribute.
 *
 * If the value is a number, it is converted to a double value.
 * If the value is a boolean, it is converted to a boolean value.
 * If the value is a string, it is converted to a string value.
 * Otherwise, the value is converted to a string value using JSON.stringify.
 *
 * @param key - The key of the log attribute.
 * @param value - The value of the log attribute.
 * @returns The serialized log attribute.
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
 * Captures a log event and sends it to Sentry.
 *
 * @param log - The log event to capture.
 * @param scope - A scope. Uses the current scope if not provided.
 * @param client - A client. Uses the current client if not provided.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function captureLog(
  { level, message, attributes, severityNumber }: Log,
  scope = getCurrentScope(),
  client = getClient(),
): void {
  if (!client) {
    DEBUG_BUILD && logger.warn('No client available to capture log.');
    return;
  }

  const { _experiments, release, environment } = client.getOptions();
  if (!_experiments?.enableLogs) {
    DEBUG_BUILD && logger.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const [, traceContext] = _getTraceInfoFromScope(client, scope);

  const logAttributes = {
    ...attributes,
  };

  if (release) {
    logAttributes.release = release;
  }

  if (environment) {
    logAttributes.environment = environment;
  }

  const span = _getSpanForScope(scope);
  if (span) {
    // Add the parent span ID to the log attributes for trace context
    logAttributes['sentry.trace.parent_span_id'] = span.spanContext().spanId;
  }

  const serializedLog: SerializedOtelLog = {
    severityText: level,
    body: {
      stringValue: message,
    },
    attributes: Object.entries(logAttributes).map(([key, value]) => logAttributeToSerializedLogAttribute(key, value)),
    timeUnixNano: `${new Date().getTime().toString()}000000`,
    traceId: traceContext?.trace_id,
    severityNumber: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
  };

  const logBuffer = CLIENT_TO_LOG_BUFFER_MAP.get(client);
  if (logBuffer === undefined) {
    CLIENT_TO_LOG_BUFFER_MAP.set(client, [serializedLog]);
    // Every time we initialize a new log buffer, we start a new interval to flush the buffer
    return;
  }

  logBuffer.push(serializedLog);
  if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
    _INTERNAL_flushLogsBuffer(client, logBuffer);
  }
}

/**
 * Flushes the logs buffer to Sentry.
 *
 * @param client - A client.
 * @param maybeLogBuffer - A log buffer. Uses the log buffer for the given client if not provided.
 */
export function _INTERNAL_flushLogsBuffer(client: Client, maybeLogBuffer?: Array<SerializedOtelLog>): void {
  const logBuffer = maybeLogBuffer ?? CLIENT_TO_LOG_BUFFER_MAP.get(client) ?? [];
  if (logBuffer.length === 0) {
    return;
  }

  const clientOptions = client.getOptions();
  const envelope = createOtelLogEnvelope(logBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());

  // Clear the log buffer after envelopes have been constructed.
  logBuffer.length = 0;

  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(envelope);
}

/**
 * Returns the log buffer for a given client.
 *
 * Exported for testing purposes.
 *
 * @param client - The client to get the log buffer for.
 * @returns The log buffer for the given client.
 */
export function _INTERNAL_getLogBuffer(client: Client): Array<SerializedOtelLog> | undefined {
  return CLIENT_TO_LOG_BUFFER_MAP.get(client);
}
