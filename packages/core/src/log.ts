import type { Client } from './client';
import { getClient, getCurrentScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Scope } from './scope';
import { getDynamicSamplingContextFromScope } from './tracing';
import type { DynamicSamplingContext, LogEnvelope, LogItem } from './types-hoist/envelope';
import type { Log, LogAttribute, LogSeverityLevel } from './types-hoist/log';
import { createEnvelope, dropUndefinedKeys, dsnToString, logger } from './utils-hoist';

/**
 * Creates envelope item for a single log
 */
export function createLogEnvelopeItem(log: Log): LogItem {
  const headers: LogItem[0] = {
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
function createLogEnvelope(logs: Log[], client: Client, scope: Scope): LogEnvelope {
  const dsc = getDynamicSamplingContextFromScope(client, scope);

  const dsn = client.getDsn();

  const headers: LogEnvelope[0] = {
    trace: dropUndefinedKeys(dsc) as DynamicSamplingContext,
    ...(dsn ? { dsn: dsnToString(dsn) } : {}),
  };

  return createEnvelope<LogEnvelope>(headers, logs.map(createLogEnvelopeItem));
}

function valueToAttribute(key: string, value: unknown): LogAttribute {
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
        value: { stringValue: JSON.stringify(value) },
      };
  }
}

let GLOBAL_LOG_BUFFER: Log[] = [];

let isFlushingLogs = false;

function addToLogBuffer(client: Client, log: Log, scope: Scope): void {
  function sendLogs(flushedLogs: Log[]): void {
    const envelope = createLogEnvelope(flushedLogs, client, scope);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void client.sendEnvelope(envelope);
  }

  if (GLOBAL_LOG_BUFFER.length >= 100) {
    sendLogs(GLOBAL_LOG_BUFFER);
    GLOBAL_LOG_BUFFER = [];
  } else {
    GLOBAL_LOG_BUFFER.push(log);
  }

  // this is the first time logs have been enabled, let's kick off an interval to flush them
  // we should only do this once.
  if (!isFlushingLogs) {
    setInterval(() => {
      if (GLOBAL_LOG_BUFFER.length > 0) {
        sendLogs(GLOBAL_LOG_BUFFER);
        GLOBAL_LOG_BUFFER = [];
      }
    }, 5000);
  }
  isFlushingLogs = true;
}

/**
 * A utility function to be able to create methods like Sentry.info`...`
 *
 * The first parameter is bound with, e.g., const info = captureLog.bind(null, 'info')
 * The other parameters are in the format to be passed a tagged template, Sentry.info`hello ${world}`
 */
export function captureLog(level: LogSeverityLevel, messages: string[] | string, ...values: unknown[]): void {
  const client = getClient();

  if (!client) {
    DEBUG_BUILD && logger.warn('No client available, log will not be captured.');
    return;
  }

  if (!client.getOptions()._experiments?.enableLogs) {
    DEBUG_BUILD && logger.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const message = Array.isArray(messages)
    ? messages.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '')
    : messages;
  const attributes = values.map<LogAttribute>((value, index) => valueToAttribute(`param${index}`, value));
  if (Array.isArray(messages)) {
    attributes.push({
      key: 'sentry.template',
      value: {
        stringValue: messages.map((s, i) => s + (i < messages.length - 1 ? `$param${i}` : '')).join(''),
      },
    });
  }

  const { release, environment } = client.getOptions();

  if (release) {
    attributes.push({
      key: 'sentry.release',
      value: {
        stringValue: release,
      },
    });
  }

  if (environment) {
    attributes.push({
      key: 'sentry.environment',
      value: {
        stringValue: environment,
      },
    });
  }

  const scope = getCurrentScope();

  const log: Log = {
    severityText: level,
    body: {
      stringValue: message,
    },
    attributes: attributes,
    timeUnixNano: `${new Date().getTime().toString()}000000`,
    traceId: scope.getPropagationContext().traceId,
  };

  addToLogBuffer(client, log, scope);
}
