const crypto = require('crypto');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { SQSClient, SendMessageCommand, ReceiveMessageCommand } = require('@aws-sdk/client-sqs');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';
const queueUrl = `https://sqs.${region}.amazonaws.com/123456789012/my-queue`;
const messageBody = 'Hello from Sentry';
const md5 = crypto.createHash('md5').update(messageBody).digest('hex');

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new SQSClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

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
  });
}

run();
