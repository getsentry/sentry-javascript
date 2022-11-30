import express from 'express';
import * as Sentry from '@sentry/node';

const app = express();

const port = 4000;

app.get('/', (_req, res) => {
  res.send('GET request to /');
});

app.post('/item', (_req, res) => {
  res.send('POST request to /item');
});

app.get('/users/:id', (req, res) => {
  res.send(`GET request with id of ${req.params.id} to /users/:id`);
});

app.get('/error', (_req, res) => {
  const error = new Error('GET request to /error');
  Sentry.captureException(error);
  res.status(500).send('GET request with error to /error');
});

app.listen(port, function () {
  console.log(`App is listening on port ${port} !`);
});
