history.pushState({}, '', '/foo?jwt=sensitive-jwt-value&a=1');
history.pushState({}, '', '/bar');

Sentry.captureException('test exception');
