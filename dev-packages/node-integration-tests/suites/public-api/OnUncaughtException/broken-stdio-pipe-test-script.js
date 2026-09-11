const Sentry = require('@sentry/node');

// The DSN has to be unreachable rather than invalid, so that `client.close()` is
// still pending while the broken pipe keeps producing errors.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@127.0.0.1:1/1337',
});

// The test runner closes both stdio streams, so this write raises EPIPE. Node ignores
// SIGPIPE, so it arrives as an uncaught exception.
setInterval(() => process.stdout.write('x'.repeat(4096)), 0);
