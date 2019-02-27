const Sentry = require('../../dist');

Sentry.init({
  debug: true,
  dsn: 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291',
  integrations: function(inte) {
    return inte.filter(int => int.name !== 'Dedupe');
  },
});

Sentry.captureException('TEST _ TEST');
Sentry.captureException({ a: 'b' });
