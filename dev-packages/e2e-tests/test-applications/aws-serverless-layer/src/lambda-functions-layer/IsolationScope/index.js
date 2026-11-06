const Sentry = require('@sentry/aws-serverless');

// Lives for as long as the container, so the test can prove that both invocations ran on the same warm container.
let invocationCount = 0;

exports.handler = async event => {
  invocationCount++;

  if (event.user) {
    Sentry.setUser({ id: event.user });
    Sentry.addBreadcrumb({ message: `handled request for ${event.user}` });
  } else {
    Sentry.captureException(new Error('anonymous request failed'));
  }

  return { invocationCount };
};
