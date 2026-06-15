const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { S3 } = require('@aws-sdk/client-s3');
const nock = require('nock');

nock.disableNetConnect();

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const region = 'us-east-1';
    const s3Client = new S3({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });
    const host = `https://ot-demo-test.s3.${region}.amazonaws.com`;

    // Successful PutObject
    nock(host).put('/aws-ot-s3-test-object.txt?x-id=PutObject').reply(200, 'test');
    await s3Client.putObject({ Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' });

    // Successful GetObject
    nock(host).get('/aws-ot-s3-test-object.txt?x-id=GetObject').reply(200, 'contents');
    const getResult = await s3Client.getObject({ Bucket: 'ot-demo-test', Key: 'aws-ot-s3-test-object.txt' });
    // Drain the body so the request fully completes
    await getResult.Body?.transformToString();

    // Failing GetObject (missing key) - should produce a span with error status
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
  });
}

run();
