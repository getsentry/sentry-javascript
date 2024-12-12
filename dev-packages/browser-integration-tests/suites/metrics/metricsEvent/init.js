import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

Sentry.metrics.increment('increment');
Sentry.metrics.increment('increment', 2);
Sentry.metrics.increment('increment', '3');
Sentry.metrics.distribution('distribution', 42);
Sentry.metrics.distribution('distribution', '45');
Sentry.metrics.gauge('gauge', 5);
Sentry.metrics.gauge('gauge', '15');
Sentry.metrics.set('set', 'nope');
Sentry.metrics.set('set', 'another');

Sentry.metrics.timing('timing', 99, 'hour');
Sentry.metrics.timing('timingSync', () => {
  sleepSync(200);
});
Sentry.metrics.timing('timingAsync', async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
});

function sleepSync(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if (new Date().getTime() - start > milliseconds) {
      break;
    }
  }
}
