const error = new TypeError('foo');
error.baz = 42;
error.foo = 'bar';

Sentry.captureException(error);
