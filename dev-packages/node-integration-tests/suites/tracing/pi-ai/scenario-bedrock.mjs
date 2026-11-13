import * as Sentry from '@sentry/node';
import {
  bedrockConverseStreamApi,
  setBedrockProviderModule,
} from '@earendil-works/pi-ai/api/bedrock-converse-stream.lazy';
import { bedrockProviderModule } from '@earendil-works/pi-ai/bedrock-provider';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { EventStreamCodec } from '@smithy/core/event-streams';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';

// pi-ai reads these when it builds its Bedrock client: no AWS credentials, and HTTP/1 to reach the
// mock server below.
process.env.AWS_BEDROCK_SKIP_AUTH = '1';
process.env.AWS_BEDROCK_FORCE_HTTP1 = '1';

// pi-ai loads its Bedrock provider through an `import()` with a variable specifier, which a bundler
// such as the Bun build cannot follow. This is pi-ai's hook for registering it statically instead.
setBedrockProviderModule(bedrockProviderModule);

// Bedrock streams responses in the binary AWS event stream format, which the SDK decodes and checks.
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

const server = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/vnd.amazon.eventstream' });
    res.end(
      Buffer.concat([
        event('messageStart', { role: 'assistant' }),
        event('contentBlockDelta', { contentBlockIndex: 0, delta: { text: 'Hi.' } }),
        event('contentBlockStop', { contentBlockIndex: 0 }),
        event('messageStop', { stopReason: 'end_turn' }),
        event('metadata', { usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }, metrics: { latencyMs: 1 } }),
      ]),
    );
  });
});
await new Promise(resolve => server.listen(0, resolve));
const baseUrl = `http://localhost:${server.address().port}`;

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

await Sentry.startSpan({ name: 'pi-ai-bedrock-test' }, async () => {
  await sendWithPiAi(models.complete(model, context));
});

server.close();
