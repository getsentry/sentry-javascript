import * as Sentry from '@sentry/aws-serverless';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import nock from 'nock';

nock.disableNetConnect();

const region = 'us-east-1';
const client = new DynamoDBClient({
  region,
  credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
  maxAttempts: 1,
});

async function putItem(tableName) {
  nock(`https://dynamodb.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({}), { 'content-type': 'application/x-amz-json-1.0' });
  await client.send(new PutItemCommand({ TableName: tableName, Item: { id: { S: 'some-id' } } }));
}

async function run() {
  await putItem('before-parent');

  const parent = Sentry.startInactiveSpan({ name: 'parent operation' });
  await Sentry.withActiveSpan(parent, () => putItem('inside-parent'));

  await putItem('after-parent');

  // Flush every operation before the parent signals that span collection is complete.
  await Sentry.flush();
  parent.end();
  await Sentry.flush();
}

run();
