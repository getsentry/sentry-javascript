import { logger as sentryLogger } from '@sentry/utils';

function wrapLogger(logFn: typeof sentryLogger[keyof typeof sentryLogger]) {
  return function wrappedLog(...args: any[]) {
    return logFn.call(sentryLogger, '[Replay]', ...args);
  };
}

const logger = {
  ...sentryLogger,
  error: wrapLogger(sentryLogger.error),
  warn: wrapLogger(sentryLogger.warn),
  log: wrapLogger(sentryLogger.log),
};

export { logger };
