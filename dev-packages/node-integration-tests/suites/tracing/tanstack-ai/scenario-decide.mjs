import express from 'express';
import * as Sentry from '@sentry/node';
import { boolean, choice, decide } from '@tanstack/ai';
import { createOpenaiDecider } from '@tanstack/ai-openai';
import OpenAI from 'openai';

// Inlined OpenAI decisions mock: the runner copies only this file into its temp dir. It refuses the question
// about a refund when the input asks it to.
function startMockProvider() {
  const app = express();
  app.use(express.json());
  app.post('/v1/decisions', (req, res) => {
    res.json({
      model: 'gpt-6-luna-2026-09-01',
      answers: [
        {
          type: 'choice',
          name: 'queue',
          choice: 'billing',
          probabilities: [
            { value: 'billing', probability: 0.9 },
            { value: 'tech', probability: 0.1 },
          ],
          confidence: 0.85,
        },
        req.body.input.includes('refuse')
          ? { type: 'refusal', name: 'refund', refusal: 'I cannot answer this.' }
          : { type: 'predicate', name: 'refund', probability: 0.8 },
      ],
      usage: { input_tokens: 30, output_tokens: 4, total_tokens: 34 },
    });
  });
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve(server));
  });
}

const server = await startMockProvider();
const baseURL = `http://localhost:${server.address().port}/v1`;
const adapter = createOpenaiDecider('gpt-6-luna', 'test-key', { baseURL });
const questions = {
  queue: choice({ instructions: 'Which team handles this ticket?', options: { billing: null, tech: null } }),
  refund: boolean({ instructions: 'Does the customer ask for a refund?' }),
};

await Sentry.startSpan({ name: 'main' }, async () => {
  await decide({ adapter, state: 'I was charged twice for my subscription.', questions });

  await Sentry.startSpan({ name: 'refused' }, async () => {
    try {
      await decide({ adapter, state: 'Please refuse to answer.', questions });
    } catch {
      // The model refused the question about a refund.
    }
  });

  await Sentry.startSpan({ name: 'direct' }, () =>
    new OpenAI({ apiKey: 'test-key', baseURL }).decisions.create({
      model: 'gpt-6-luna',
      input: 'I was charged twice for my subscription.',
      questions: [{ type: 'predicate', name: 'refund', instructions: 'Does the customer ask for a refund?' }],
    }),
  );
});

server.close();
