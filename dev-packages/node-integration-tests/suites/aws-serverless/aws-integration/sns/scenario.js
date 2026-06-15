const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';
const topicArn = 'arn:aws:sns:us-east-1:123456789012:my-topic';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new SNSClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

    nock(`https://sns.${region}.amazonaws.com`)
      .post('/')
      .reply(
        200,
        '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><PublishResult><MessageId>message-id-1</MessageId></PublishResult><ResponseMetadata><RequestId>request-id-1</RequestId></ResponseMetadata></PublishResponse>',
        { 'content-type': 'text/xml' },
      );

    await client.send(new PublishCommand({ TopicArn: topicArn, Message: 'Hello from Sentry' }));
  });
}

run();
