Error.stackTraceLimit = Infinity;

const Raven = require('./lib/client');

Raven.config('https://363a337c11a64611be4845ad6e24f3ac@sentry.io/297378', {
  stacktrace: true
});

// setTimeout(function() {
function foo() {
  Raven.captureMessage('captureMessage');
}
function bar() {
  foo();
}

bar();
// Sentry.captureException(new Error('captureException'));
// }, 5000);
