const Sentry = require('@sentry/node');

const client = Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  _experimentalUseOrchestrion: true,
});

Sentry._experimentalSetupOrchestrion(client);

const express = require('express');
const mysql = require('mysql');

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

const app = express();
const port = 3030;

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-mysql', function (req, res) {
  connection.query('SELECT 1 + 1 AS solution', function () {
    connection.query('SELECT NOW()', ['1', '2'], () => {
      res.send({ status: 'ok' });
    });
  });
});

app.get('/test-transaction', function (_req, res) {
  Sentry.startSpan({ name: 'test-span' }, () => undefined);

  res.send({ status: 'ok' });
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

// @ts-ignore
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
