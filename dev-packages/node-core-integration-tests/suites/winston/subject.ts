import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import winston from 'winston';
import Transport from 'winston-transport';
import { setupOtel } from '../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  // Purposefully specifying the experimental flag here
  // to ensure the top level option is still respected.
  _experiments: {
    enableLogs: true,
  },
  transport: loggingTransport,
});

setupOtel(client);

async function run(): Promise<void> {
  // Create a custom transport that extends winston-transport
  const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport);

  // Create logger with default levels
  const logger = winston.createLogger({
    transports: [new SentryWinstonTransport()],
  });

  // Test basic logging
  logger.info('Test info message');
  logger.error('Test error message');

  // If custom levels are requested
  if (process.env.CUSTOM_LEVELS === 'true') {
    const customLevels = {
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6,
      },
      colors: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        http: 'magenta',
        verbose: 'cyan',
        debug: 'blue',
        silly: 'grey',
      },
    };

    const customLogger = winston.createLogger({
      levels: customLevels.levels,
      transports: [new SentryWinstonTransport()],
    });

    customLogger.info('Test info message');
    customLogger.error('Test error message');
  }

  // If metadata is requested
  if (process.env.WITH_METADATA === 'true') {
    logger.info('Test message with metadata', {
      foo: 'bar',
      number: 42,
    });
  }

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
