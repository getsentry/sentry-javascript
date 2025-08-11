import * as Sentry from '@sentry/aws-serverless';

export const handler = Sentry.wrapHandler(async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      event,
    }),
  };
});
