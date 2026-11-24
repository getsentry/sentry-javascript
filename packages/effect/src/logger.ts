import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { isObjectLike, logger as sentryLogger } from '@sentry/core';
import type * as Layer from 'effect/Layer';
import * as EffectLogger from 'effect/Logger';
import type * as LogLevel from 'effect/LogLevel';
import { isEffectV4, loggerExports } from './compat';

const LOG_ATTRIBUTES = {
  [SENTRY_ORIGIN]: 'auto.log.effect',
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

const effectLogger = EffectLogger.make(({ logLevel, message }) => {
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

/**
 * Layer that sends Effect logs to Sentry. It adds the Sentry logger to the loggers in place, so Effect still logs
 * to the console.
 *
 * Effect v4 builds all layers of a `Layer.mergeAll` from the same loggers, so next to another layer that adds a
 * logger, only one of the two loggers stays. Stack such layers with `Layer.provideMerge`:
 *
 * @example
 * ```typescript
 * const LoggerLayer = Sentry.layerLogger.pipe(Layer.provideMerge(OtlpLoggerLayer));
 * ```
 */
export const layerLogger: Layer.Layer<never> = isEffectV4
  ? loggerExports.layer([effectLogger], { mergeWithExisting: true })
  : loggerExports.add(effectLogger);
