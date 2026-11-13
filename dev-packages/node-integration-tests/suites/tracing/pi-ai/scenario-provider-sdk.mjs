import * as Sentry from '@sentry/node';
import { createServer } from 'node:http';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import OpenAI from 'openai';

const COMPLETION = {
  id: 'chatcmpl-mock',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'mock-model',
  usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
};

const server = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    if (JSON.parse(body).stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const choices = [{ index: 0, delta: { role: 'assistant', content: 'Hi.' }, finish_reason: 'stop' }];
      res.end(`data: ${JSON.stringify({ ...COMPLETION, choices })}\n\ndata: [DONE]\n\n`);
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      const choices = [{ index: 0, message: { role: 'assistant', content: 'Hi.' }, finish_reason: 'stop' }];
      res.end(JSON.stringify({ ...COMPLETION, object: 'chat.completion', choices }));
    }
  });
});
await new Promise(resolve => server.listen(0, resolve));
const baseUrl = `http://localhost:${server.address().port}/v1`;

const model = {
  id: 'pi-model',
  name: 'pi-model',
  api: 'openai-completions',
  provider: 'mock',
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
    id: 'mock',
    name: 'Mock',
    baseUrl,
    auth: { apiKey: { name: 'Mock', resolve: async () => ({ auth: { apiKey: 'mock-api-key' }, source: 'mock' }) } },
    models: [model],
    api: openAICompletionsApi(),
  }),
);
const context = { messages: [{ role: 'user', content: 'Hi.', timestamp: Date.now() }] };
const openai = new OpenAI({ baseURL: baseUrl, apiKey: 'mock-api-key' });
const callOpenAi = () => openai.chat.completions.create({ model: 'direct-model', messages: [] });

// pi-ai settles a failed request as a message instead of rejecting, and one that never reached the
// SDK would pass the test's assertion that the SDK reported nothing.
const sendWithPiAi = async request => {
  const { stopReason, errorMessage } = await request;
  if (stopReason !== 'stop') {
    throw new Error(`pi-ai request failed: ${errorMessage}`);
  }
};

await Sentry.startSpan({ name: 'pi-ai-provider-test' }, async () => {
  await sendWithPiAi(models.complete(model, context));
  // A direct call after pi-ai has sent a request, and one alongside a request in flight.
  await callOpenAi();
  await Promise.all([sendWithPiAi(models.stream(model, context).result()), callOpenAi()]);
});

server.close();
