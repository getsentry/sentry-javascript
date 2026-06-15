const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new DynamoDBClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

    nock(`https://dynamodb.${region}.amazonaws.com`)
      .post('/')
      .reply(200, JSON.stringify({}), { 'content-type': 'application/x-amz-json-1.0' });

    await client.send(
      new PutItemCommand({
        TableName: 'my-table',
        Item: { id: { S: 'some-id' } },
      }),
    );

    nock(`https://dynamodb.${region}.amazonaws.com`)
      .post('/')
      .reply(200, JSON.stringify({ Items: [{ id: { S: 'some-id' } }], Count: 1, ScannedCount: 1 }), {
        'content-type': 'application/x-amz-json-1.0',
      });

    await client.send(
      new QueryCommand({
        TableName: 'my-table',
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': { S: 'some-id' } },
      }),
    );
  });
}

run();
