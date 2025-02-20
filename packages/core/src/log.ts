import { getClient, getCurrentScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
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
function addLog(log: Log): void {
  const client = getClient();

  if (!client) {
    DEBUG_BUILD && logger.warn('No client available, log will not be captured.');
    return;
  }

  if (!client.getOptions()._experiments?.enableLogs) {
    DEBUG_BUILD && logger.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const scope = getCurrentScope();
  const dsc = getDynamicSamplingContextFromScope(client, scope);

  const dsn = client.getDsn();

  const headers: LogEnvelope[0] = {
    trace: dropUndefinedKeys(dsc) as DynamicSamplingContext,
    ...(dsn ? { dsn: dsnToString(dsn) } : {}),
  };
  if (!log.traceId) {
    log.traceId = dsc.trace_id;
  }
  if (!log.timeUnixNano) {
    log.timeUnixNano = `${new Date().getTime().toString()}000000`;
  }

  const envelope = createEnvelope<LogEnvelope>(headers, [createLogEnvelopeItem(log)]);

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  void client.sendEnvelope(envelope);
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

/**
 * A utility function to be able to create methods like Sentry.info`...`
 *
 * The first parameter is bound with, e.g., const info = captureLog.bind(null, 'info')
 * The other parameters are in the format to be passed a tagged template, Sentry.info`hello ${world}`
 */
export function captureLog(level: LogSeverityLevel, messages: string[] | string, ...values: unknown[]): void {
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
  addLog({
    severityText: level,
    body: {
      stringValue: message,
    },
    attributes: attributes,
  });
}
