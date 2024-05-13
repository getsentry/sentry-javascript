const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  debug: true,
  transport: loggingTransport,
});

const { S3 } = require('@aws-sdk/client-s3');
const nock = require('nock');

async function run() {
  const bucketName = 'aws-test-bucket';
  const keyName = 'aws-test-object.txt';

  nock(`https://${bucketName}.s3.amazonaws.com`).get(`/${keyName}`).reply(200, 'contents');
  nock(`https://${bucketName}.s3.amazonaws.com`).put(`/${keyName}`).reply(200, 'contents');

  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const region = 'us-east-1';
    const s3Client = new S3({ region });
    nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
      .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
      .reply(200, 'test');

    const params = {
      Bucket: 'ot-demo-test',
      Key: 'aws-ot-s3-test-object.txt',
    };
    await s3Client.putObject(params);
  });
}

run();
