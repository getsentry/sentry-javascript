import * as Sentry from '@sentry/node';
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import express from 'express';

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/systemone', (req, res) => {
    res.json({
      model: req.body.model,
      answers: { authIssue: { type: 'noul', noul: 0.98 } },
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
  const client = new TypeSafeClient({
    apiKey: 'mock-api-key',
    baseURL: `http://localhost:${server.address().port}`,
    retry: { maxRetries: 0 },
  });
  const request = { state: 'I cannot log in.', questions: { authIssue: noul('Is there a login problem?') } };

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.systemOne({ ...request, model: 'public' });
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.systemOne({ ...request, model: 'private' });

      // Changing the tag after the call started must not change its outputs decision.
      const pending = client.systemOne({ ...request, model: 'public-late' });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      await pending;
    });
  });

  server.close();
}

run();
