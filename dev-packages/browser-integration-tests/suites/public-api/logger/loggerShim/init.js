import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1,
});

// These should not actually work, but still not error out
Sentry.logger.trace('test trace');
Sentry.logger.debug('test debug');
Sentry.logger.info('test info');
Sentry.logger.warn('test warn');
Sentry.logger.error('test error');
Sentry.logger.fatal('test fatal');
const testVar = 'test';
Sentry.logger.info(Sentry.logger.fmt`formatted ${testVar}`);
