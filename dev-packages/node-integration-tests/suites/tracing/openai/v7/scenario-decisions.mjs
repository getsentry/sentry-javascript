import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/openai/decisions', (req, res) => {
    const { model } = req.body;

    if (model === 'error-model') {
      res.status(500).set('x-request-id', 'mock-request-error').end('Internal server error');
      return;
    }

    res.send({
      model: 'gpt-6-luna-2026-09-01',
      answers: [
        { type: 'predicate', name: 'wants_refund', probability: 0.97 },
        {
          type: 'choice',
          name: 'department',
          choice: 'billing',
          confidence: 0.82,
          probabilities: [
            { value: 'billing', probability: 0.82 },
            { value: 'other', probability: 0.18 },
          ],
        },
        { type: 'refusal', name: 'urgency' },
      ],
      usage: {
        input_tokens: 120,
        input_tokens_details: { cached_tokens: 40, cache_write_tokens: 0 },
        output_tokens: 3,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 123,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

const questions = [
  { type: 'predicate', name: 'wants_refund', instructions: 'Is a refund requested?' },
  {
    type: 'choice',
    name: 'department',
    instructions: 'Which team should handle this?',
    choices: [{ value: 'billing' }, { value: 'other' }],
  },
  {
    type: 'score',
    name: 'urgency',
    instructions: 'How urgent is this ticket?',
    levels: [{ label: 'low' }, { label: 'high' }],
  },
];

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
    });

    await client.decisions.create({
      model: 'gpt-6-luna',
      input: 'I was charged twice and want a refund.',
      questions,
    });

    await client.decisions.create({
      model: 'gpt-6-luna',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Is the package damaged?' },
            { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
          ],
        },
      ],
      questions: [{ type: 'predicate', name: 'damaged', instructions: 'Is there visible damage?' }],
    });

    try {
      await client.decisions.create({ model: 'error-model', input: 'Error test', questions });
    } catch {
      // Error is expected and handled
    }
  });

  server.close();
}

run();
