const Sentry = require('@sentry/aws-serverless');

exports.handler = async event => {
  if (event.tag) {
    Sentry.setTag('invocation_tag', event.tag);
  } else {
    Sentry.captureException(new Error('untagged request failed'));
  }
};
