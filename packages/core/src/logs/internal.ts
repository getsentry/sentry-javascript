import { serializeAttributes } from '../attributes';
import { getGlobalSingleton } from '../carrier';
import type { Client } from '../client';
import { getClient, getCurrentScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Integration } from '../types-hoist/integration';
import type { Log, SerializedLog } from '../types-hoist/log';
import { consoleSandbox, debug } from '../utils/debug-logger';
import { isParameterizedString } from '../utils/is';
import { getCombinedScopeData } from '../utils/scopeData';
import { _getSpanForScope } from '../utils/spanOnScope';
import { timestampInSeconds } from '../utils/time';
import { _getTraceInfoFromScope } from '../utils/trace-info';
import { SEVERITY_TEXT_TO_SEVERITY_NUMBER } from './constants';
import { createLogEnvelope } from './envelope';

const MAX_LOG_BUFFER_SIZE = 100;

/**
 * Sets a log attribute if the value exists and the attribute key is not already present.
 *
 * @param logAttributes - The log attributes object to modify.
 * @param key - The attribute key to set.
 * @param value - The value to set (only sets if truthy and key not present).
 * @param setEvenIfPresent - Whether to set the attribute if it is present. Defaults to true.
 */
function setLogAttribute(
  logAttributes: Record<string, unknown>,
  key: string,
  value: unknown,
  setEvenIfPresent = true,
): void {
  if (value && (!logAttributes[key] || setEvenIfPresent)) {
    logAttributes[key] = value;
  }
}

/**
 * Captures a serialized log event and adds it to the log buffer for the given client.
 *
 * @param client - A client. Uses the current client if not provided.
 * @param serializedLog - The serialized log event to capture.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_captureSerializedLog(client: Client, serializedLog: SerializedLog): void {
  const bufferMap = _getBufferMap();
  const logBuffer = _INTERNAL_getLogBuffer(client);

  if (logBuffer === undefined) {
    bufferMap.set(client, [serializedLog]);
  } else {
    if (logBuffer.length >= MAX_LOG_BUFFER_SIZE) {
      _INTERNAL_flushLogsBuffer(client, logBuffer);
      bufferMap.set(client, [serializedLog]);
    } else {
      bufferMap.set(client, [...logBuffer, serializedLog]);
    }
  }
}

/**
 * Captures a log event and sends it to Sentry.
 *
 * @param log - The log event to capture.
 * @param scope - A scope. Uses the current scope if not provided.
 * @param client - A client. Uses the current client if not provided.
 * @param captureSerializedLog - A function to capture the serialized log.
 *
 * @experimental This method will experience breaking changes. This is not yet part of
 * the stable Sentry SDK API and can be changed or removed without warning.
 */
export function _INTERNAL_captureLog(
  beforeLog: Log,
  currentScope = getCurrentScope(),
  captureSerializedLog: (client: Client, log: SerializedLog) => void = _INTERNAL_captureSerializedLog,
): void {
  const client = currentScope?.getClient() ?? getClient();
  if (!client) {
    DEBUG_BUILD && debug.warn('No client available to capture log.');
    return;
  }

  const { release, environment, enableLogs = false, beforeSendLog } = client.getOptions();
  if (!enableLogs) {
    DEBUG_BUILD && debug.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const [, traceContext] = _getTraceInfoFromScope(client, currentScope);

  const processedLogAttributes = {
    ...beforeLog.attributes,
  };

  const {
    user: { id, email, username },
    attributes: scopeAttributes = {},
  } = getCombinedScopeData(getIsolationScope(), currentScope);

  setLogAttribute(processedLogAttributes, 'user.id', id, false);
  setLogAttribute(processedLogAttributes, 'user.email', email, false);
  setLogAttribute(processedLogAttributes, 'user.name', username, false);

  setLogAttribute(processedLogAttributes, 'sentry.release', release);
  setLogAttribute(processedLogAttributes, 'sentry.environment', environment);

  const { name, version } = client.getSdkMetadata()?.sdk ?? {};
  setLogAttribute(processedLogAttributes, 'sentry.sdk.name', name);
  setLogAttribute(processedLogAttributes, 'sentry.sdk.version', version);

  const replay = client.getIntegrationByName<
    Integration & {
      getReplayId: (onlyIfSampled?: boolean) => string;
      getRecordingMode: () => 'session' | 'buffer' | undefined;
    }
  >('Replay');

  const replayId = replay?.getReplayId(true);
  setLogAttribute(processedLogAttributes, 'sentry.replay_id', replayId);

  if (replayId && replay?.getRecordingMode() === 'buffer') {
    // We send this so we can identify cases where the replayId is attached but the replay itself might not have been sent to Sentry
    setLogAttribute(processedLogAttributes, 'sentry._internal.replay_is_buffering', true);
  }

  const beforeLogMessage = beforeLog.message;
  if (isParameterizedString(beforeLogMessage)) {
    const { __sentry_template_string__, __sentry_template_values__ = [] } = beforeLogMessage;
    if (__sentry_template_values__?.length) {
      processedLogAttributes['sentry.message.template'] = __sentry_template_string__;
    }
    __sentry_template_values__.forEach((param, index) => {
      processedLogAttributes[`sentry.message.parameter.${index}`] = param;
    });
  }

  const span = _getSpanForScope(currentScope);
  // Add the parent span ID to the log attributes for trace context
  setLogAttribute(processedLogAttributes, 'sentry.trace.parent_span_id', span?.spanContext().spanId);

  const processedLog = { ...beforeLog, attributes: processedLogAttributes };

  client.emit('beforeCaptureLog', processedLog);

  // We need to wrap this in `consoleSandbox` to avoid recursive calls to `beforeSendLog`
  const log = beforeSendLog ? consoleSandbox(() => beforeSendLog(processedLog)) : processedLog;
  if (!log) {
    client.recordDroppedEvent('before_send', 'log_item', 1);
    DEBUG_BUILD && debug.warn('beforeSendLog returned null, log will not be captured.');
    return;
  }

  const { level, message, attributes: logAttributes = {}, severityNumber } = log;

  const serializedLog: SerializedLog = {
    timestamp: timestampInSeconds(),
    level,
    body: message,
    trace_id: traceContext?.trace_id,
    severity_number: severityNumber ?? SEVERITY_TEXT_TO_SEVERITY_NUMBER[level],
    attributes: {
      ...serializeAttributes(scopeAttributes),
      ...serializeAttributes(logAttributes, true),
    },
  };

  captureSerializedLog(client, serializedLog);

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
  _getBufferMap().set(client, []);

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
  return _getBufferMap().get(client);
}

function _getBufferMap(): WeakMap<Client, Array<SerializedLog>> {
  // The reference to the Client <> LogBuffer map is stored on the carrier to ensure it's always the same
  return getGlobalSingleton('clientToLogBufferMap', () => new WeakMap<Client, Array<SerializedLog>>());
}
