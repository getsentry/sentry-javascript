import * as Sentry from '@sentry/aws-serverless';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  debug: true,
  _experiments: {
    enableLambdaExtension: true,
  },
});

export const handler = async (event, context) => {
  Sentry.startSpan({ name: 'manual-span', op: 'test' }, async () => {
    return 'Hello, world!';
  });
};
