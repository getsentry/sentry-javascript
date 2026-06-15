const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { SFNClient, StartExecutionCommand } = require('@aws-sdk/client-sfn');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';
const stateMachineArn = 'arn:aws:states:us-east-1:123456789012:stateMachine:my-state-machine';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new SFNClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

    nock(`https://states.${region}.amazonaws.com`)
      .post('/')
      .reply(200, JSON.stringify({ executionArn: `${stateMachineArn}:execution-1`, startDate: 1 }), {
        'content-type': 'application/x-amz-json-1.0',
      });

    await client.send(new StartExecutionCommand({ stateMachineArn, input: '{}' }));
  });
}

run();
