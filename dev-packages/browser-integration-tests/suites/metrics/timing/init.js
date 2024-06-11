import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  release: '1.0.0',
  autoSessionTracking: false,
});

window.timingSync = () => {
  // Ensure we always have a wrapping span
  return Sentry.startSpan({ name: 'manual span' }, () => {
    return Sentry.metrics.timing('timingSync', () => {
      sleepSync(200);
      return 'sync done';
    });
  });
};

window.timingAsync = () => {
  // Ensure we always have a wrapping span
  return Sentry.startSpan({ name: 'manual span' }, () => {
    return Sentry.metrics.timing('timingAsync', async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return 'async done';
    });
  });
};

function sleepSync(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if (new Date().getTime() - start > milliseconds) {
      break;
    }
  }
}
