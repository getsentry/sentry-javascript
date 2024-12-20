import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  beforeSend(event) {
    Sentry.captureFeedback({
      event_id: event.event_id,
      name: 'John Doe',
      email: 'john@doe.com',
      comments: 'This feedback should be attached associated with the captured error',
    });
    return event;
  },
});
