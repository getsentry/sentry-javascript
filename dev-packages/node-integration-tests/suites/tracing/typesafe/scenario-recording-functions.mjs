import * as Sentry from '@sentry/node';
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import express from 'express';

const app = express();
app.post('/v1/systemone', (_req, res) => res.json({ answers: { authIssue: { type: 'noul', noul: 0.98 } } }));
const server = app.listen(0, async () => {
  const client = new TypeSafeClient({
    apiKey: 'mock-api-key',
    baseURL: `http://localhost:${server.address().port}`,
    retry: { maxRetries: 0 },
  });

  function decide(model) {
    Sentry.getCurrentScope().setTag('privacy', model);
    const pending = client.systemOne({
      state: 'I cannot log in.',
      questions: { authIssue: noul('Login problem?') },
      model,
    });
    Sentry.getCurrentScope().setTag('privacy', 'public');
    return pending;
  }

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await Sentry.withScope(() => decide('public'));
    await Sentry.withScope(() => decide('private'));
  });
  server.close();
});
