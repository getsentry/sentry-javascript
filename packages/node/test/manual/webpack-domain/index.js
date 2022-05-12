const Sentry = require('../../../build/cjs');
const { colorize } = require('../colorize');

let remaining = 2;

function makeDummyTransport() {
  return Sentry.createTransport({ recordDroppedEvent: () => undefined }, req => {
    --remaining;

    if (!remaining) {
      console.log(colorize('PASSED: Webpack Node Domain test OK!\n', 'green'));
      process.exit(0);
    }

    return Promise.resolve({
      status: 'success',
    });
  });
}

Sentry.init({
  dsn: 'https://a@example.com/1',
  transport: makeDummyTransport,
  beforeSend(event) {
    if (event.message === 'inside') {
      if (event.tags.a !== 'x' && event.tags.b !== 'c') {
        console.log(colorize('FAILED: Scope contains incorrect tags\n', 'red'));
        process.exit(1);
      }
    }
    if (event.message === 'outside') {
      if (event.tags.a !== 'b') {
        console.log(colorize('FAILED: Scope contains incorrect tags\n', 'red'));
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
    scope.setTag('b', 'c');
  });
  Sentry.captureMessage('inside');
});

Sentry.captureMessage('outside');
