import * as Sentry from '@sentry/node';
import { choice, noul, score, TypeSafeClient } from '@typesafe-ai/sdk';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/systemone', (req, res) => {
    if (req.body.model === 'error-model') {
      res.status(400).json({ error: 'Unknown model' });
      return;
    }

    res.json({
      model: 'jev-1.13.0',
      answers: {
        authIssue: { type: 'noul', noul: 0.98 },
        department: {
          type: 'choice',
          choice: 'billing',
          confidence: 0.28,
          probabilities: { billing: 0.64, technical: 0.36 },
        },
        urgency: {
          type: 'score',
          score: 1.58,
          confidence: 0.9,
          legend: { 0: 'low', 1: 'medium', 2: 'high' },
          probabilities: { 0: 0, 1: 0.42, 2: 0.58 },
        },
      },
      usage: { input_tokens: 275, output_tokens: 20 },
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
  const client = Sentry.instrumentTypeSafeClient(
    new TypeSafeClient({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}`,
      retry: { maxRetries: 0 },
    }),
  );
  const state = 'I cannot log in, and I also want a refund for last month.';
  const questions = {
    authIssue: noul('Is there a login problem?'),
    department: choice('Which team should handle this?', {
      billing: 'Charges and refunds',
      technical: 'Bugs and outages',
    }),
    urgency: score('How urgent is this ticket?', ['low', 'medium', 'high']),
  };

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await client.systemOne({ state, questions });

    // The instrumentation must not read the body the caller gets from `asResponse()`.
    const response = await client.systemOne({ model: 'jev-1.13', state, questions }).asResponse();
    await response.json();

    try {
      await client.systemOne({ model: 'error-model', state, questions });
    } catch {
      // expected
    }

    // The SDK rejects empty questions with a `TypeSafeError` before sending the request.
    try {
      await client.systemOne({ model: 'validation-error', state, questions: {} });
    } catch {
      // expected
    }
  });

  server.close();
}

run();
