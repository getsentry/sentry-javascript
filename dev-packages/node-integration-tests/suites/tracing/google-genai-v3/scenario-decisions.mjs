import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/v1/decisions', (req, res) => {
    if (req.body.model === 'models/error-model') {
      // A 400, not a 500: the decisions client retries 5xx responses with backoff by default.
      res.status(400).end('Bad request');
      return;
    }

    res.send({
      answers: {
        wants_refund: { type: 'noul', noul: 0.97, confidence: 0.94 },
        department: {
          type: 'choice',
          choice: 'billing',
          probabilities: { billing: 0.82, other: 0.18 },
          confidence: 0.82,
        },
        urgency: {
          type: 'score',
          score: 1,
          probabilities: { 0: 0.05, 1: 0.95 },
          legend: { 0: 'low', 1: 'high' },
          confidence: 0.93,
        },
      },
      usage: { total_input_tokens: 382, total_cached_tokens: 256, total_output_tokens: 0, total_tokens: 382 },
    });
  });

  return startMockServer(app);
}

const questions = {
  wants_refund: {
    type: 'noul',
    instructions: 'Is a refund requested?',
    criteria: { true_description: 'Asks for money back' },
  },
  department: {
    type: 'choice',
    instructions: 'Which team should handle this?',
    criteria: { billing: 'Charges and refunds', other: 'Anything else' },
  },
  urgency: { type: 'score', instructions: 'How urgent is this ticket?', criteria: ['low', 'high'] },
};

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: server.url },
    });

    await client.decisions.create({
      model: 'models/gemini-3-flash',
      input: 'I was charged twice and want a refund.',
      questions,
    });

    await client.decisions.create({
      model: 'models/gemini-3-flash',
      input: [
        { type: 'text', text: 'Is the package damaged?' },
        { type: 'image', mime_type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' },
      ],
      questions: { damaged: { type: 'noul', instructions: 'Is there visible damage?' } },
    });

    try {
      await client.decisions.create({ model: 'models/error-model', input: 'Error test', questions });
    } catch {}
  });

  server.close();
}

run();
