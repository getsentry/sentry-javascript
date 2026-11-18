import { ChatAnthropic } from '@langchain/anthropic';
import { modelRouterMiddleware } from '@langchain/typesafe/middleware';
import * as Sentry from '@sentry/node';
import express from 'express';
import { createAgent } from 'langchain';
import { anthropicMessage, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/messages', (req, res) => {
    res.json(
      anthropicMessage(req.body.model, {
        id: 'msg_router_test',
        content: 'A refund is on its way.',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });

  app.post('/v1/systemone', (req, res) => {
    res.json({
      model: 'jev-1.13',
      answers: {
        model_route: { type: 'choice', choice: 'fast', probabilities: { fast: 0.9, smart: 0.1 }, confidence: 0.8 },
      },
      usage: { input_tokens: 40, output_tokens: 3 },
    });
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();
  const baseUrl = server.url;

  const model = name => new ChatAnthropic({ model: name, apiKey: 'mock-api-key', clientOptions: { baseURL: baseUrl } });

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const agent = createAgent({
      name: 'support_agent',
      model: model('claude-3-5-sonnet-20241022'),
      middleware: [
        modelRouterMiddleware({
          instructions: 'Pick the model for this request.',
          choices: {
            fast: { model: model('claude-3-5-haiku-20241022'), criteria: 'Simple requests' },
            smart: { model: model('claude-3-5-sonnet-20241022'), criteria: 'Complex requests' },
          },
          classifierOptions: { apiKey: 'mock-api-key', baseUrl },
        }),
      ],
    });

    await agent.invoke({ messages: [{ role: 'user', content: 'Where is my refund?' }] });
  });

  server.close();
}

run();
