import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

// `AnthropicBedrock` (`@anthropic-ai/bedrock-sdk`) is a `BaseAnthropic` subclass that names its platform this way
// and reuses the SDK's `Messages` resource.
class BedrockClient extends Anthropic {
  constructor(options) {
    super(options);
    this._genAIProviderName = 'aws.bedrock';
  }
}

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json(anthropicMessage(req.body.model, { id: 'msg_bedrock', content: 'Hello!' }));
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new BedrockClient({ apiKey: 'mock-api-key', baseURL: server.url });
    await client.messages.create({
      model: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
