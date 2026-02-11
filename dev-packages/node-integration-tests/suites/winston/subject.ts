import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import winston from 'winston';
import Transport from 'winston-transport';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  enableLogs: true,
  transport: loggingTransport,
  debug: true,
});

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

  if (process.env.WITH_FILTER === 'true') {
    const FilteredSentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport, {
      levels: ['error'],
    });
    const filteredLogger = winston.createLogger({
      transports: [new FilteredSentryWinstonTransport()],
    });

    filteredLogger.info('Ignored message');
    filteredLogger.error('Test error message');
  }

  // If unmapped custom level is requested (tests debug line for unknown levels)
  if (process.env.UNMAPPED_CUSTOM_LEVEL === 'true') {
    const customLevels = {
      levels: {
        myUnknownLevel: 0,
        error: 1,
      },
    };

    // Create transport WITHOUT customLevelMap for myUnknownLevel
    // myUnknownLevel will default to 'info', but we only capture 'error'
    const UnmappedSentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport, {
      levels: ['error'],
    });

    const unmappedLogger = winston.createLogger({
      levels: customLevels.levels,
      level: 'error',
      transports: [new UnmappedSentryWinstonTransport()],
    });

    // This should NOT be captured (unknown level defaults to 'info', which is not in levels)
    // @ts-ignore - custom levels are not part of the winston logger
    unmappedLogger.myUnknownLevel('This unknown level message should be skipped');
    // This SHOULD be captured
    unmappedLogger.error('This error message should be captured');
  }

  // If custom level mapping is requested
  if (process.env.CUSTOM_LEVEL_MAPPING === 'true') {
    const customLevels = {
      levels: {
        customCritical: 0,
        customWarning: 1,
        customNotice: 2,
      },
    };

    const SentryWinstonTransport = Sentry.createSentryWinstonTransport(Transport, {
      customLevelMap: {
        customCritical: 'fatal',
        customWarning: 'warn',
        customNotice: 'info',
      },
    });

    const mappedLogger = winston.createLogger({
      levels: customLevels.levels,
      // https://github.com/winstonjs/winston/issues/1491
      // when custom levels are set with a transport,
      // the level must be set on the logger
      level: 'customNotice',
      transports: [new SentryWinstonTransport()],
    });

    // @ts-ignore - custom levels are not part of the winston logger
    mappedLogger.customCritical('This is a critical message');
    // @ts-ignore - custom levels are not part of the winston logger
    mappedLogger.customWarning('This is a warning message');
    // @ts-ignore - custom levels are not part of the winston logger
    mappedLogger.customNotice('This is a notice message');
  }

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
