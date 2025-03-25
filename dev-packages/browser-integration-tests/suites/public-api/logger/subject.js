Sentry.logger.trace('test trace');
Sentry.logger.debug('test debug');
Sentry.logger.info('test info');
Sentry.logger.warn('test warn');
Sentry.logger.error('test error');
Sentry.logger.fatal('test fatal');
Sentry.logger.critical('test critical');

const formattedMessage = (message, ...args) => {
  return Sentry.logger.fmt`test ${message} ${args}`;
};

Sentry.logger.trace(formattedMessage('trace', 'stringArg', 123));
Sentry.logger.debug(formattedMessage('debug', 'stringArg', 123));
Sentry.logger.info(formattedMessage('info', 'stringArg', 123));
Sentry.logger.warn(formattedMessage('warn', 'stringArg', 123));
Sentry.logger.error(formattedMessage('error', 'stringArg', 123));
Sentry.logger.fatal(formattedMessage('fatal', 'stringArg', 123));
Sentry.logger.critical(formattedMessage('critical', 'stringArg', 123));

Sentry.flush();
