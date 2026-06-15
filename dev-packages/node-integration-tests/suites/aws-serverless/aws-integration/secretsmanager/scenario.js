const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const nock = require('nock');

nock.disableNetConnect();

const region = 'us-east-1';
const secretArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc';

async function run() {
  await Sentry.startSpan({ name: 'Test Transaction' }, async () => {
    const client = new SecretsManagerClient({
      region,
      credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
      maxAttempts: 1,
    });

    nock(`https://secretsmanager.${region}.amazonaws.com`)
      .post('/')
      .reply(200, JSON.stringify({ ARN: secretArn, Name: 'my-secret', SecretString: 'secret-value' }), {
        'content-type': 'application/x-amz-json-1.1',
      });

    await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  });
}

run();
