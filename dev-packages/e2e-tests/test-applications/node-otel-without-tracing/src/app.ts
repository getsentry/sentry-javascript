import './instrument';

// Other imports below
import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();
const port = 3030;

Sentry.setTag('root-level-tag', 'yes');

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (req, res) {
  Sentry.withActiveSpan(null, async () => {
    Sentry.startSpan({ name: 'test-transaction', op: 'e2e-test' }, () => {
      Sentry.startSpan({ name: 'test-span' }, () => undefined);
    });

    await fetch('http://localhost:3030/test-success');

    res.send({});
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-exception/:id', function (req, _res) {
  const id = req.params.id;
  Sentry.setTag(`param-${id}`, id);

  throw new Error(`This is an exception with id ${id}`);
});

Sentry.setupExpressErrorHandler(app);

app.use(function onError(err: unknown, req: any, res: any, next: any) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
