import * as Sentry from '@sentry/aws-serverless';

let handler = async (event, responseStream, context) => {
  Sentry.startSpan({ name: 'streaming-span', op: 'stream' }, () => {
    responseStream.write('Starting stream\n');
  });

  responseStream.write('Continuing stream\n');
  responseStream.write('Stream completed\n');
  responseStream.end();
};

handler[Symbol.for('aws.lambda.runtime.handler.streaming')] = 'response';
handler = Sentry.wrapHandler(handler);

export { handler };
