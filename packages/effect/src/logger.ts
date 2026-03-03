import { logger as sentryLogger } from '@sentry/core';
import * as Logger from 'effect/Logger';
import * as LogLevel from 'effect/LogLevel';

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

  if (LogLevel.greaterThanEqual(logLevel, LogLevel.Error)) {
    sentryLogger.error(msg);
  } else if (LogLevel.greaterThanEqual(logLevel, LogLevel.Warning)) {
    sentryLogger.warn(msg);
  } else if (LogLevel.greaterThanEqual(logLevel, LogLevel.Info)) {
    sentryLogger.info(msg);
  } else if (LogLevel.greaterThanEqual(logLevel, LogLevel.Debug)) {
    sentryLogger.debug(msg);
  } else {
    sentryLogger.trace(msg);
  }
});
