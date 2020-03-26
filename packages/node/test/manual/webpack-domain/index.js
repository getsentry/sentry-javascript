import * as Sentry from '@sentry/node';

let remaining = 2;

class DummyTransport {
  sendEvent(event) {
    --remaining;

    if (!remaining) {
      console.error('SUCCESS: Webpack Node Domain test OK!');
      process.exit(0);
    }

    return Promise.resolve({
      status: 'success',
    });
  }
}

Sentry.init({
  dsn: 'https://a@example.com/1',
  transport: DummyTransport,
  beforeSend(event) {
    if (event.message === 'inside') {
      if (event.tags.a !== 'x') {
        console.error('FAILED: Scope contains incorrect tags');
        process.exit(1);
      }
    }
    if (event.message === 'outside') {
      if (event.tags.a !== 'b') {
        console.error('FAILED: Scope contains incorrect tags');
        process.exit(1);
      }
    }
    return event;
  },
});

Sentry.configureScope(scope => {
  scope.setTag('a', 'b');
});

const d = require('domain').create();
d.run(() => {
  Sentry.configureScope(scope => {
    scope.setTag('a', 'x');
  });
  Sentry.captureMessage('inside');
});

Sentry.captureMessage('outside');
