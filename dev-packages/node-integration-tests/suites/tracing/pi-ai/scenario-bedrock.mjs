import * as Sentry from '@sentry/node';
import { bedrockConverseStreamApi } from '@earendil-works/pi-ai/api/bedrock-converse-stream.lazy';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { EventStreamCodec } from '@smithy/core/event-streams';
// Force the HTTP/1 handler so `nock` can intercept the direct call instead of hitting real AWS.
import { NodeHttpHandler } from '@smithy/node-http-handler';
import nock from 'nock';
import { Buffer } from 'node:buffer';

// pi-ai reads these when it builds its Bedrock client: no AWS credentials, and HTTP/1 so `nock` can
// intercept the request.
process.env.AWS_BEDROCK_SKIP_AUTH = '1';
process.env.AWS_BEDROCK_FORCE_HTTP1 = '1';

nock.disableNetConnect();

const region = 'us-east-1';
const baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;

const codec = new EventStreamCodec(
  bytes => Buffer.from(bytes).toString('utf8'),
  text => Buffer.from(text),
);

function event(eventType, payload) {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: Buffer.from(JSON.stringify(payload)),
  });
}

// One request from pi-ai, one direct call.
nock(baseUrl)
  .post(/\/model\/.*\/converse-stream$/)
  .times(2)
  .reply(
    200,
    () =>
      Buffer.concat([
        event('messageStart', { role: 'assistant' }),
        event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Hi.' } }),
        event('contentBlockStop', { contentBlockIndex: 0 }),
        event('messageStop', { stopReason: 'end_turn' }),
        event('metadata', { usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }, metrics: { latencyMs: 1 } }),
      ]),
    { 'content-type': 'application/vnd.amazon.eventstream' },
  );

const model = {
  id: 'pi-bedrock-model',
  name: 'pi-bedrock-model',
  api: 'bedrock-converse-stream',
  provider: 'amazon-bedrock',
  baseUrl,
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
};
const models = createModels();
models.setProvider(
  createProvider({
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    baseUrl,
    auth: { apiKey: { name: 'Bedrock', resolve: async () => ({ auth: {}, source: 'mock' }) } },
    models: [model],
    api: bedrockConverseStreamApi(),
  }),
);
const context = { messages: [{ role: 'user', content: 'Hi.', timestamp: Date.now() }] };

const sendWithPiAi = async request => {
  const { stopReason, errorMessage } = await request;
  if (stopReason !== 'stop') {
    throw new Error(`pi-ai request failed: ${errorMessage}`);
  }
};

const callBedrock = async () => {
  const client = new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId: 'aws-test-key', secretAccessKey: 'aws-test-secret' },
    maxAttempts: 1,
    requestHandler: new NodeHttpHandler(),
  });
  const response = await client.send(
    new ConverseStreamCommand({ modelId: 'direct-model', messages: [{ role: 'user', content: [{ text: 'Hi.' }] }] }),
  );
  for await (const _ of response.stream) {
    // Drain the stream so the span ends.
  }
};

await Sentry.startSpan({ name: 'pi-ai-bedrock-test' }, async () => {
  await sendWithPiAi(models.complete(model, context));
  await callBedrock();
});
