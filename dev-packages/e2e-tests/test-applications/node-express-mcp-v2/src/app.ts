import * as Sentry from '@sentry/node';
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
