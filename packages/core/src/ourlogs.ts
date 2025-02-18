import { getClient, getGlobalScope } from './currentScopes';
import type { LogEnvelope, LogItem } from './types-hoist/envelope';
import type { Log, LogAttribute, LogSeverityLevel } from './types-hoist/ourlogs';
import { createEnvelope, dsnToString } from './utils-hoist';

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
    return;
  }

  if (!client.getOptions()._experiments?.logSupport) {
    return;
  }

  const globalScope = getGlobalScope();
  const dsn = client.getDsn();

  const headers: LogEnvelope[0] = {
    trace: {
      trace_id: globalScope.getPropagationContext().traceId,
      public_key: dsn?.publicKey,
    },
    ...(dsn ? { dsn: dsnToString(dsn) } : {}),
  };
  if (!log.traceId) {
    log.traceId = globalScope.getPropagationContext().traceId || '00000000-0000-0000-0000-000000000000';
  }
  if (!log.timeUnixNano) {
    log.timeUnixNano = `${new Date().getTime().toString()}000000`;
  }

  const envelope = createEnvelope<LogEnvelope>(headers, [createLogEnvelopeItem(log)]);

  // sendEnvelope should not throw
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  client.sendEnvelope(envelope);
}

function valueToAttribute(key: string, value: unknown): LogAttribute {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return {
        key,
        value: {
          intValue: value,
        },
      };
    }
    return {
      key,
      value: {
        doubleValue: value,
      },
    };
  } else if (typeof value === 'boolean') {
    return {
      key,
      value: {
        boolValue: value,
      },
    };
  } else if (typeof value === 'string') {
    return {
      key,
      value: {
        stringValue: value,
      },
    };
  } else {
    return {
      key,
      value: {
        stringValue: JSON.stringify(value),
      },
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
