import './instrument';

import * as Sentry from '@sentry/node';
import express from 'express';

const PORT = 3030;
const app = express();

const wait = (duration: number) => {
  return new Promise<void>(res => {
    setTimeout(() => res(), duration);
  });
};

app.get('/task', async (_req, res) => {
  await Sentry.startSpan({ name: 'Long task', op: 'custom.op' }, async () => {
    await wait(200);
  });
  res.send('ok');
});

app.get('/unsampled/task', async (_req, res) => {
  await wait(200);
  res.send('ok');
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-exception/:id', function (req, _res) {
  throw new Error(`This is an exception with id ${req.params.id}`);
});

Sentry.setupExpressErrorHandler(app);

app.use(function onError(err: unknown, req: any, res: any, next: any) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(PORT, () => {
  console.log('App listening on ', PORT);
});
