import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();
const port = 3030;

app.use(express.json());

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

Sentry.setupExpressErrorHandler(app);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Example app listening on port ${port}`);
});
