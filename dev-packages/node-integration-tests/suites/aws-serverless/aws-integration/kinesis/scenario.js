const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { KinesisClient, PutRecordCommand } = require('@aws-sdk/client-kinesis');
// The Kinesis client defaults to an HTTP/2 request handler, which `nock` cannot intercept.
// Force the HTTP/1 handler so the request is mocked instead of hitting real AWS.
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new KinesisClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
      requestHandler: new NodeHttpHandler(),
    });

    nock(`https://kinesis.${region}.amazonaws.com`)
      .post('/')
      .reply(200, JSON.stringify({ SequenceNumber: '1', ShardId: 'shardId-000000000000' }), {
        'content-type': 'application/x-amz-json-1.1',
      });

    await client.send(
      new PutRecordCommand({ StreamName: 'my-stream', Data: Buffer.from('data'), PartitionKey: 'partition-key' }),
    );
  });
}

run();
