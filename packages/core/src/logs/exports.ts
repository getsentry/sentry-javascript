import type { Client } from '../client';
import type { SerializedLog, SerializedLogAttributeValue, Log } from '../types-hoist/log';

import { _getTraceInfoFromScope } from '../client';
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { SEVERITY_TEXT_TO_SEVERITY_NUMBER } from './constants';
import { _getSpanForScope } from '../utils/spanOnScope';
import { createLogEnvelope } from './envelope';
import { logger } from '../utils-hoist/logger';
import { isParameterizedString } from '../utils-hoist/is';
import { timestampInSeconds } from '../utils-hoist/time';

const MAX_LOG_BUFFER_SIZE = 100;

const CLIENT_TO_LOG_BUFFER_MAP = new WeakMap<Client, Array<SerializedLog>>();

/**
 * Converts a log attribute to a serialized log attribute.
 *
 * @param key - The key of the log attribute.
 * @param value - The value of the log attribute.
 * @returns The serialized log attribute.
 */
export function logAttributeToSerializedLogAttribute(value: unknown): SerializedLogAttributeValue {
  switch (typeof value) {
    case 'number':
      if (Number.isInteger(value)) {
        return {
          value,
          type: 'integer',
        };
      }
      return {
        value,
        type: 'double',
      };
    case 'boolean':
      return {
        value,
        type: 'boolean',
      };
    case 'string':
      return {
        value,
        type: 'string',
      };
    default: {
      let stringValue = '';
      try {
        stringValue = JSON.stringify(value) ?? '';
      } catch {
        // Do nothing
      }
      return {
        value: stringValue,
        type: 'string',
      };
    }
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
export function _INTERNAL_captureLog(
  beforeLog: Log,
  client: Client | undefined = getClient(),
  scope = getCurrentScope(),
): void {
  if (!client) {
    DEBUG_BUILD && logger.warn('No client available to capture log.');
    return;
  }

  const { _experiments, release, environment } = client.getOptions();
  const { enableLogs = false, beforeSendLog } = _experiments ?? {};
  if (!enableLogs) {
    DEBUG_BUILD && logger.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const [, traceContext] = _getTraceInfoFromScope(client, scope);

  const processedLogAttributes = {
    ...beforeLog.attributes,
  };

  if (release) {
    processedLogAttributes['sentry.release'] = release;
  }

  if (environment) {
    processedLogAttributes['sentry.environment'] = environment;
  }

  const { sdk } = client.getSdkMetadata() ?? {};
  if (sdk) {
    processedLogAttributes['sentry.sdk.name'] = sdk.name;
    processedLogAttributes['sentry.sdk.version'] = sdk.version;
  }

  const beforeLogMessage = beforeLog.message;
  if (isParameterizedString(beforeLogMessage)) {
    const { __sentry_template_string__, __sentry_template_values__ = [] } = beforeLogMessage;
    processedLogAttributes['sentry.message.template'] = __sentry_template_string__;
    __sentry_template_values__.forEach((param, index) => {
      processedLogAttributes[`sentry.message.parameter.${index}`] = param;
    });
  }

  const span = _getSpanForScope(scope);
  if (span) {
    // Add the parent span ID to the log attributes for trace context
    processedLogAttributes['sentry.trace.parent_span_id'] = span.spanContext().spanId;
  }

  const processedLog = { ...beforeLog, attributes: processedLogAttributes };

  client.emit('beforeCaptureLog', processedLog);

  const log = beforeSendLog ? beforeSendLog(processedLog) : processedLog;
  if (!log) {
    client.recordDroppedEvent('before_send', 'log_item', 1);
    DEBUG_BUILD && logger.warn('beforeSendLog returned null, log will not be captured.');
    return;
  }

  const { level, message, attributes = {}, severityNumber } = log;

  const serializedLog: SerializedLog = {
    timestamp: timestampInSeconds(),
    level,
    body: message,
    trace_id: traceContext?.trace_id,
    severity_number: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
    attributes: Object.keys(attributes).reduce(
      (acc, key) => {
        acc[key] = logAttributeToSerializedLogAttribute(attributes[key]);
        return acc;
      },
      {} as Record<string, SerializedLogAttributeValue>,
    ),
  };

  const logBuffer = CLIENT_TO_LOG_BUFFER_MAP.get(client);
  if (logBuffer === undefined) {
    CLIENT_TO_LOG_BUFFER_MAP.set(client, [serializedLog]);
  } else {
    CLIENT_TO_LOG_BUFFER_MAP.set(client, [...logBuffer, serializedLog]);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
      _INTERNAL_flushLogsBuffer(client, logBuffer);
    }
  }

  client.emit('afterCaptureLog', log);
}

/**
 * Flushes the logs buffer to Sentry.
 *
 * @param client - A client.
 * @param maybeLogBuffer - A log buffer. Uses the log buffer for the given client if not provided.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_flushLogsBuffer(client: Client, maybeLogBuffer?: Array<SerializedLog>): void {
  const logBuffer = maybeLogBuffer ?? _INTERNAL_getLogBuffer(client) ?? [];
  if (logBuffer.length === 0) {
    return;
  }

  const clientOptions = client.getOptions();
  const envelope = createLogEnvelope(logBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());

  // Clear the log buffer after envelopes have been constructed.
  CLIENT_TO_LOG_BUFFER_MAP.set(client, []);

  client.emit('flushLogs');

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
export function _INTERNAL_getLogBuffer(client: Client): Array<SerializedLog> | undefined {
  return CLIENT_TO_LOG_BUFFER_MAP.get(client);
}
