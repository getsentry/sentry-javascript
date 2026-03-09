import { logger as sentryLogger } from '@sentry/core';
import * as Logger from 'effect/Logger';

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

  switch (logLevel._tag) {
    case 'Fatal':
      sentryLogger.fatal(msg);
      break;
    case 'Error':
      sentryLogger.error(msg);
      break;
    case 'Warning':
      sentryLogger.warn(msg);
      break;
    case 'Info':
      sentryLogger.info(msg);
      break;
    case 'Debug':
      sentryLogger.debug(msg);
      break;
    case 'Trace':
      sentryLogger.trace(msg);
      break;
    case 'All':
    case 'None':
      break;
    default:
      logLevel satisfies never;
  }
});
