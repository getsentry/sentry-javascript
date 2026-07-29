import { isObjectLike, logger as sentryLogger, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import * as Logger from 'effect/Logger';
import type * as LogLevel from 'effect/LogLevel';

const LOG_ATTRIBUTES = {
  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.log.effect',
};

function getLogLevelTag(logLevel: LogLevel.LogLevel): LogLevel.LogLevel | 'Warning' {
  // Effect v4: logLevel is a string literal directly
  if (typeof logLevel === 'string') {
    return logLevel;
  }

  // Effect v3: logLevel has _tag property
  if (isObjectLike(logLevel) && '_tag' in logLevel) {
    return (logLevel as { _tag: LogLevel.LogLevel })._tag;
  }

  return 'Info';
}

/**
 * Effect Logger that sends logs to Sentry.
 */
export const SentryEffectLogger = Logger.make(({ logLevel, message }) => {
  let msg: string;
  if (typeof message === 'string') {
    msg = message;
  } else if (Array.isArray(message) && message.length === 1) {
    const firstElement = message[0];
    msg = typeof firstElement === 'string' ? firstElement : JSON.stringify(firstElement);
  } else {
    msg = JSON.stringify(message);
  }

  const tag = getLogLevelTag(logLevel);

  switch (tag) {
    case 'Fatal':
      sentryLogger.fatal(msg, LOG_ATTRIBUTES);
      break;
    case 'Error':
      sentryLogger.error(msg, LOG_ATTRIBUTES);
      break;
    case 'Warning': // Effect v3
    case 'Warn': // Effect v4
      sentryLogger.warn(msg, LOG_ATTRIBUTES);
      break;
    case 'Info':
      sentryLogger.info(msg, LOG_ATTRIBUTES);
      break;
    case 'Debug':
      sentryLogger.debug(msg, LOG_ATTRIBUTES);
      break;
    case 'Trace':
      sentryLogger.trace(msg, LOG_ATTRIBUTES);
      break;
    case 'All':
    case 'None':
      break;
    default:
      tag satisfies never;
  }
});
