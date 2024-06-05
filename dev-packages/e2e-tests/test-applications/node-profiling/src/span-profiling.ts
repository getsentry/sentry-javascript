import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import express from 'express';

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

const app = express();
const port = 3030;

app.get('/test', function (req, res) {
  res.send({ version: 'v1' });
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  console.log(`e2e test app listening on port ${port}`);
});


