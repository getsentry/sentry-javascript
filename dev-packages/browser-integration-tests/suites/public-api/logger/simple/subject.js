Sentry.logger.trace('test trace');
Sentry.logger.debug('test debug');
Sentry.logger.info('test info');
Sentry.logger.warn('test warn');
Sentry.logger.error('test error');
Sentry.logger.fatal('test fatal');

const formattedMessage = (message, stringArg, boolArg, numberArg) => {
  return Sentry.logger.fmt`test ${message} ${stringArg} ${boolArg} ${numberArg}`;
};

Sentry.logger.trace(formattedMessage('trace', 'stringArg', false, 123));
Sentry.logger.debug(formattedMessage('debug', 'stringArg', false, 123));
Sentry.logger.info(formattedMessage('info', 'stringArg', false, 123));
Sentry.logger.warn(formattedMessage('warn', 'stringArg', false, 123));
Sentry.logger.error(formattedMessage('error', 'stringArg', false, 123));
Sentry.logger.fatal(formattedMessage('fatal', 'stringArg', false, 123));

Sentry.flush();
