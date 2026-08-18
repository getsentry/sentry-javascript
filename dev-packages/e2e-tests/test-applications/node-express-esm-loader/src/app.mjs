// @ts-check

import * as Sentry from '@sentry/node';
import express from 'express';
// @ts-ignore -- `mysql` ships no type declarations; only needed at runtime.
import mysql from 'mysql';

const connection = mysql.createConnection({
  user: 'root',
  password: 'docker',
});

const app = express();
const port = 3030;

app.get('/test-success', function (req, res) {
  setTimeout(() => {
    res.status(200).end();
  }, 100);
});

app.get('/test-mysql', function (req, res) {
  connection.query('SELECT 1 + 1 AS solution', function () {
    connection.query('SELECT NOW()', ['1', '2'], () => {
      res.send({ status: 'ok' });
    });
  });
});

app.get('/test-transaction/:param', function (req, res) {
  setTimeout(() => {
    res.status(200).end();
  }, 100);
});

app.get('/test-error', function (req, res) {
  Sentry.captureException(new Error('This is an error'));
  setTimeout(() => {
    Sentry.flush(2000).then(() => {
      res.status(200).end();
    });
  }, 100);
});

Sentry.setupExpressErrorHandler(app);

app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
