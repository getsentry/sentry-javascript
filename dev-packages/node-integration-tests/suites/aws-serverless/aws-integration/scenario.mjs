import * as Sentry from '@sentry/aws-serverless';
import { createHash } from 'crypto';
import { DynamoDBClient, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { KinesisClient, PutRecordCommand } from '@aws-sdk/client-kinesis';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { S3 } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
// The Kinesis client defaults to an HTTP/2 request handler, which `nock` cannot intercept.
// Force the HTTP/1 handler so the request is mocked instead of hitting real AWS.
import { NodeHttpHandler } from '@smithy/node-http-handler';
import nock from 'nock';

nock.disableNetConnect();

const region = 'us-east-1';
const credentials = { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' };

async function s3() {
  const s3Client = new S3({ region, credentials, maxAttempts: 1 });
  const host = `https://ot-demo-test.s3.${region}.amazonaws.com`;

  nock(host).put('/aws-ot-s3-test-object.txt?x-id=PutObject').reply(200, 'test');
  await s3Client.putObject({ Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' });

  nock(host).get('/aws-ot-s3-test-object.txt?x-id=GetObject').reply(200, 'contents');
  const getResult = await s3Client.getObject({ Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' });
  await getResult.Body?.transformToString();

  nock(host)
    .get('/missing-object.txt?x-id=GetObject')
    .reply(
      404,
      '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>',
      { 'content-type': 'application/xml' },
    );
  try {
    await s3Client.getObject({ Bucket: 'ot-demo-test', Key: 'missing-object.txt' });
  } catch {
    // expected
  }
}

async function dynamodb() {
  const client = new DynamoDBClient({ region, credentials, maxAttempts: 1 });

  nock(`https://dynamodb.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({}), { 'content-type': 'application/x-amz-json-1.0' });
  await client.send(new PutItemCommand({ TableName: 'my-table', Item: { id: { S: 'some-id' } } }));

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
}

async function sqs() {
  const client = new SQSClient({ region, credentials, maxAttempts: 1 });
  const queueUrl = `https://sqs.${region}.amazonaws.com/123456789012/my-queue`;
  const messageBody = 'Hello from Sentry';
  const md5 = createHash('md5').update(messageBody).digest('hex');

  nock(`https://sqs.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({ MessageId: 'message-id-1', MD5OfMessageBody: md5 }), {
      'content-type': 'application/x-amz-json-1.0',
    });
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: messageBody }));

  nock(`https://sqs.${region}.amazonaws.com`)
    .post('/')
    .reply(
      200,
      JSON.stringify({
        Messages: [{ MessageId: 'message-id-2', Body: messageBody, MD5OfBody: md5, ReceiptHandle: 'handle' }],
      }),
      { 'content-type': 'application/x-amz-json-1.0' },
    );
  await client.send(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
}

async function sns() {
  const client = new SNSClient({ region, credentials, maxAttempts: 1 });

  nock(`https://sns.${region}.amazonaws.com`)
    .post('/')
    .reply(
      200,
      '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><PublishResult><MessageId>message-id-1</MessageId></PublishResult><ResponseMetadata><RequestId>request-id-1</RequestId></ResponseMetadata></PublishResponse>',
      { 'content-type': 'text/xml' },
    );
  await client.send(new PublishCommand({ TopicArn: 'arn:aws:sns:us-east-1:123456789012:my-topic', Message: 'Hello' }));
}

async function lambda() {
  const client = new LambdaClient({ region, credentials, maxAttempts: 1 });

  nock(`https://lambda.${region}.amazonaws.com`)
    .post('/2015-03-31/functions/my-function/invocations')
    .reply(200, JSON.stringify({ result: 'ok' }), {
      'content-type': 'application/json',
      'x-amzn-requestid': 'request-id-1',
    });
  await client.send(new InvokeCommand({ FunctionName: 'my-function' }));
}

async function kinesis() {
  const client = new KinesisClient({ region, credentials, maxAttempts: 1, requestHandler: new NodeHttpHandler() });

  nock(`https://kinesis.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({ SequenceNumber: '1', ShardId: 'shardId-000000000000' }), {
      'content-type': 'application/x-amz-json-1.1',
    });
  await client.send(
    new PutRecordCommand({ StreamName: 'my-stream', Data: Buffer.from('data'), PartitionKey: 'partition-key' }),
  );
}

async function secretsmanager() {
  const client = new SecretsManagerClient({ region, credentials, maxAttempts: 1 });
  const secretArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc';

  nock(`https://secretsmanager.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({ ARN: secretArn, Name: 'my-secret', SecretString: 'secret-value' }), {
      'content-type': 'application/x-amz-json-1.1',
    });
  await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
}

async function stepfunctions() {
  const client = new SFNClient({ region, credentials, maxAttempts: 1 });
  const stateMachineArn = 'arn:aws:states:us-east-1:123456789012:stateMachine:my-state-machine';

  nock(`https://states.${region}.amazonaws.com`)
    .post('/')
    .reply(200, JSON.stringify({ executionArn: `${stateMachineArn}:execution-1`, startDate: 1 }), {
      'content-type': 'application/x-amz-json-1.0',
    });
  await client.send(new StartExecutionCommand({ stateMachineArn, input: '{}' }));
}

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    await s3();
    await dynamodb();
    await sqs();
    await sns();
    await lambda();
    await kinesis();
    await secretsmanager();
    await stepfunctions();
  });
}

run();
