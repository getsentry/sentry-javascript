import * as Sentry from '@sentry/aws-serverless';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import nock from 'nock';

nock.disableNetConnect();
nock('https://bedrock-runtime.us-east-1.amazonaws.com')
  .post(/\/converse$/)
  .times(2)
  .reply(200, { output: { message: { role: 'assistant', content: [{ text: 'Hi' }] } }, stopReason: 'end_turn' });

const client = new BedrockRuntimeClient({
  region: 'us-east-1',
  credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
  maxAttempts: 1,
  requestHandler: new NodeHttpHandler(),
});

function converse(modelId, privacy) {
  Sentry.getCurrentScope().setTag('privacy', privacy);
  const pending = client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: 'Hello' }] }],
      requestMetadata: { privacy },
    }),
  );
  Sentry.getCurrentScope().setTag('privacy', 'public');
  return pending;
}

Sentry.startSpan({ name: 'main' }, async () => {
  await Sentry.withScope(() => converse('public-model', 'public'));
  await Sentry.withScope(() => converse('private-model', 'private'));
});
