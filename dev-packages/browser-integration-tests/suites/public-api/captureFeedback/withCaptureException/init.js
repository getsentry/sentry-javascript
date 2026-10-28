import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  beforeSend(event) {
    Sentry.captureFeedback({
      associatedEventId: event.event_id,
      name: 'John Doe',
      email: 'john@doe.com',
      message: 'This feedback should be attached associated with the captured error',
    });
    return event;
  },
});
