import { HumanMessage } from '@langchain/core/messages';
import { TypeSafeClassifier } from '@langchain/typesafe';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockTypeSafeServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/systemone', (req, res) => {
    res.json({
      model: 'jev-1.13',
      answers: { urgent: { type: 'noul', noul: 0.9 } },
      usage: { input_tokens: 30, output_tokens: 2 },
    });
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockTypeSafeServer();
  const baseUrl = server.url;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const classifier = new TypeSafeClassifier({
      apiKey: 'mock-api-key',
      baseUrl,
      questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
    });

    await classifier.invoke('My payouts have been failing.');
    await classifier.invoke(new HumanMessage('My card was charged twice.'));
  });

  server.close();
}

run();
