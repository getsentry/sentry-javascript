const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new LambdaClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

    nock(`https://lambda.${region}.amazonaws.com`)
      .post('/2015-03-31/functions/my-function/invocations')
      .reply(200, JSON.stringify({ result: 'ok' }), {
        'content-type': 'application/json',
        'x-amzn-requestid': 'request-id-1',
      });

    await client.send(new InvokeCommand({ FunctionName: 'my-function' }));
  });
}

run();
