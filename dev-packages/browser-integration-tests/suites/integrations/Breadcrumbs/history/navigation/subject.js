history.pushState({}, '', '/foo');
history.pushState({}, '', '/bar?a=1#fragment');
history.pushState({}, '', {});
history.pushState({}, '', null);
history.replaceState({}, '', '/bar?a=1#fragment');

Sentry.captureException('test exception');
