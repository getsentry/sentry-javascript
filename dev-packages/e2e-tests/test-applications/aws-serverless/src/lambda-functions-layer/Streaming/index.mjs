import * as Sentry from '@sentry/aws-serverless';

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  Sentry.startSpan({ name: 'manual-span', op: 'test' }, async () => {
    responseStream.write('Hello, world!');
    responseStream.end();
  });
});
