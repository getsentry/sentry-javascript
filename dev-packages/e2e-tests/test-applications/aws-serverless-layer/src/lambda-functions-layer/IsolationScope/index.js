const Sentry = require('@sentry/aws-serverless');

exports.handler = async event => {
  if (event.tag) {
    Sentry.setTag('invocation_tag', event.tag);
  }

  Sentry.captureException(new Error(event.errorMessage));
};
