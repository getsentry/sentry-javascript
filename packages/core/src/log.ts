import type { Client } from './client';
import { getClient, getCurrentScope, getIsolationScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Scope } from './scope';
import { getDynamicSamplingContextFromScope } from './tracing';
import type { ParameterizedString } from './types-hoist';
import type { DynamicSamplingContext, LogEnvelope, LogItem } from './types-hoist/envelope';
import type { Log, LogAttribute, LogSeverityLevel } from './types-hoist/log';
import { createEnvelope, dropUndefinedKeys, dsnToString, isParameterizedString, logger } from './utils-hoist';
import { getActiveSpan } from './utils/spanUtils';

const LOG_BUFFER_MAX_LENGTH = 25;

const GLOBAL_LOG_BUFFER: Log[] = [];
let globalLogBufferIndex = 0;

let isFlushingLogs = false;

const SEVERITY_TEXT_TO_SEVERITY_NUMBER: Partial<Record<LogSeverityLevel | 'log', number>> = {
  trace: 1,
  debug: 5,
  info: 9,
  log: 10,
  warn: 13,
  error: 17,
  fatal: 21,
};

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
        value: { stringValue: JSON.stringify(value) ?? '' },
      };
  }
}

function addToLogBuffer(client: Client, log: Log, scope: Scope, isolationScope: Scope): void {
  function sendLogs(flushedLogs: Log[]): void {
    const envelope = createLogEnvelope(flushedLogs, client, scope);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void client.sendEnvelope(envelope);
  }

  if (GLOBAL_LOG_BUFFER.length >= LOG_BUFFER_MAX_LENGTH) {
    const beforeSendLogs = client.getOptions()?._experiments?.beforeSendLogs;
    if(!beforeSendLogs || beforeSendLogs?.(GLOBAL_LOG_BUFFER, isolationScope.lastEventId())) {
      sendLogs(GLOBAL_LOG_BUFFER);
      GLOBAL_LOG_BUFFER.length = 0;
      globalLogBufferIndex = 0;
    } else {
      // we should not send the logs buffer, evict a single log to make space for this one.
      GLOBAL_LOG_BUFFER[globalLogBufferIndex] = log;
      globalLogBufferIndex = (globalLogBufferIndex + 1) % LOG_BUFFER_MAX_LENGTH;
    }
  } else {
    GLOBAL_LOG_BUFFER.push(log);
  }

  // this is the first time logs have been enabled, let's kick off an interval to flush them
  // we should only do this once.
  if (!isFlushingLogs) {
    const tryFlushLogs = (): void => {
      const beforeSendLogs = client.getOptions()?._experiments?.beforeSendLogs;
      if (!beforeSendLogs || beforeSendLogs?.(GLOBAL_LOG_BUFFER, isolationScope.lastEventId())) { // TODO: implement error tracking
        sendLogs(GLOBAL_LOG_BUFFER);
        GLOBAL_LOG_BUFFER.length = 0;
        globalLogBufferIndex = 0;
      }
    }
    client.on('flush', () => {
      tryFlushLogs();
    });

    const flushTimer = setInterval(() => {
      tryFlushLogs();
    }, 5000);

    // We need to unref the timer in node.js, otherwise the node process never exit.
    if (typeof flushTimer !== 'number' && flushTimer.unref) {
      flushTimer.unref();
    }
  }
  isFlushingLogs = true;
}

/**
 * A utility function to be able to create methods like Sentry.info(...).
 */
export function sendLog(
  level: LogSeverityLevel,
  severityNumber?: number,
): (message: ParameterizedString<unknown[]> | string, customAttributes?: Record<string, unknown>) => void {
  return (message: ParameterizedString<unknown[]> | string, attributes: Record<string, unknown> = {}): void =>
    captureLog({ level, message, attributes, severityNumber });
}

/**
 * Sends a log to Sentry.
 */
export function captureLog({
  level,
  message,
  attributes,
  severityNumber,
}: {
  level: LogSeverityLevel;
  message: ParameterizedString<unknown[]> | string;
  attributes?: Record<string, unknown>;
  severityNumber?: number;
}): void {
  const client = getClient();

  if (!client) {
    DEBUG_BUILD && logger.warn('No client available, log will not be captured.');
    return;
  }

  if (!client.getOptions()._experiments?.enableLogs) {
    DEBUG_BUILD && logger.warn('logging option not enabled, log will not be captured.');
    return;
  }

  const { release, environment } = client.getOptions();

  const logAttributes = {
    ...attributes,
  };

  if (isParameterizedString(message)) {
    const { __sentry_template_string__ = '', __sentry_template_values__ = [] } = message;
    if (__sentry_template_string__) {
      logAttributes['sentry.message.template'] = __sentry_template_string__;
      __sentry_template_values__.forEach((value, index) => {
        logAttributes[`sentry.message.parameters.${index}`] = value;
      });
    }
  }

  const span = getActiveSpan();
  if (span) {
    logAttributes['sentry.trace.parent_span_id'] = span.spanContext().spanId;
  }

  if (release) {
    logAttributes['sentry.release'] = release;
  }

  if (environment) {
    logAttributes['sentry.environment'] = environment;
  }

  const scope = getCurrentScope();
  const isolationScope = getIsolationScope();

  const finalAttributes = Object.entries(logAttributes).map<LogAttribute>(([key, value]) =>
    valueToAttribute(key, value),
  );

  const log: Log = {
    severityText: level,
    body: {
      stringValue: message,
    },
    attributes: finalAttributes,
    timeUnixNano: `${new Date().getTime().toString()}000000`,
    traceId: scope.getPropagationContext().traceId,
    severityNumber,
  };

  const maybeSeverityNumber = SEVERITY_TEXT_TO_SEVERITY_NUMBER[level];
  if (maybeSeverityNumber !== undefined && log.severityNumber === undefined) {
    log.severityNumber = maybeSeverityNumber;
  }

  addToLogBuffer(client, log, scope, isolationScope);
}
