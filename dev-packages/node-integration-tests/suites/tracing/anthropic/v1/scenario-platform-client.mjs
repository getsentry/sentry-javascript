import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

// `AnthropicBedrock` (`@anthropic-ai/bedrock-sdk`) is a `BaseAnthropic` subclass that names its platform this way
// and reuses the SDK's `Messages` resource.
class BedrockClient extends Anthropic {
  constructor(options) {
    super(options);
    this._genAIProviderName = 'aws.bedrock';
  }
}

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json({
      id: 'msg_bedrock',
      type: 'message',
      role: 'assistant',
      model: req.body.model,
      content: [{ type: 'text', text: 'Hello!' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 15 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new BedrockClient({ apiKey: 'mock-api-key', baseURL: `http://localhost:${server.address().port}` });
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
