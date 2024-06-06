
import * as Sentry from '@sentry/node';
// @ts-expect-error ignore this for now
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import express from 'express';

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
});

const app = express();
const port = 3030;

app.get('/test', function (req, res) {
  res.send({ version: 'v1' });
});

app.listen(port, () => {
  console.log(`e2e test app listening on port ${port}`);

  const client = Sentry.getClient();
  if (!client) {
    throw new Error('Client not found');
  }

  const integration = client.getIntegrationByName('ProfilingIntegration');
  if (!integration) {
    throw new Error('Profiling integration not found');
  }

  console.log("Starting continuous profiler", integration);
  // @ts-expect-error this is private
  integration['_profiler'].start();
});


