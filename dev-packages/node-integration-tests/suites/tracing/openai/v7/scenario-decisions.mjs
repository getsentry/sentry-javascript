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

    // Shaped like a real `gpt-6-luna` response. Decisions bills input tokens only.
    res.send({
      model: 'gpt-6-luna',
      answers: [
        { type: 'predicate', name: 'wants_refund', probability: 0.97 },
        {
          type: 'choice',
          name: 'department',
          choice: 'billing',
          probabilities: [
            { value: 'billing', probability: 0.82 },
            { value: 'other', probability: 0.18 },
          ],
          confidence: 0.82,
        },
        {
          type: 'score',
          name: 'urgency',
          score: 0.95,
          probabilities: [
            { value: 0, label: 'low', probability: 0.05 },
            { value: 1, label: 'high', probability: 0.95 },
          ],
          confidence: 0.93,
        },
      ],
      usage: {
        input_tokens: 382,
        input_tokens_details: { cached_tokens: 256, cache_write_tokens: 64 },
        output_tokens: 0,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 382,
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
    choices: [{ value: 'billing', description: 'Charges and refunds' }, { value: 'other' }],
  },
  {
    type: 'score',
    name: 'urgency',
    instructions: 'How urgent is this ticket?',
    levels: [{ label: 'low' }, { label: 'high', description: 'Blocks the customer' }],
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
