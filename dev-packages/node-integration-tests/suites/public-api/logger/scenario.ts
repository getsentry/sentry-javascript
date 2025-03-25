import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'test',
  _experiments: {
    enableLogs: true,
  },
  transport: loggingTransport,
});

async function run(): Promise<void> {
  Sentry.logger.trace('test trace');
  Sentry.logger.debug('test debug');
  Sentry.logger.info('test info');
  Sentry.logger.warn('test warn');
  Sentry.logger.error('test error');
  Sentry.logger.fatal('test fatal');

  const formattedMessage = (
    message: string,
    stringArg: string,
    boolArg: boolean,
    numberArg: number,
  ): ReturnType<typeof Sentry.logger.fmt> => {
    return Sentry.logger.fmt`test ${message} ${stringArg} ${boolArg} ${numberArg}`;
  };

  Sentry.logger.trace(formattedMessage('trace', 'stringArg', false, 123));
  Sentry.logger.debug(formattedMessage('debug', 'stringArg', false, 123));
  Sentry.logger.info(formattedMessage('info', 'stringArg', false, 123));
  Sentry.logger.warn(formattedMessage('warn', 'stringArg', false, 123));
  Sentry.logger.error(formattedMessage('error', 'stringArg', false, 123));
  Sentry.logger.fatal(formattedMessage('fatal', 'stringArg', false, 123));

  Sentry.logger.trace('test %s with node format', ['trace']);
  Sentry.logger.debug('test %s with node format', ['debug']);
  Sentry.logger.info('test %s with node format', ['info']);
  Sentry.logger.warn('test %s with node format', ['warn']);
  Sentry.logger.error('test %s with node format', ['error']);
  Sentry.logger.fatal('test %s with node format', ['fatal']);

  await Sentry.flush();
}

run().catch(() => undefined);
