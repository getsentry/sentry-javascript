import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

import express from 'express';
import { mcpRouter } from './mcp.js';

const app = express();
const port = 3030;

app.use(express.json());
app.use(mcpRouter);

app.get('/test-success', function (_req, res) {
  res.send({ version: 'v1' });
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
