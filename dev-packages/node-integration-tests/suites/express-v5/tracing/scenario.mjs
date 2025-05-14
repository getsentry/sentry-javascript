import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.raw());

app.get('/', (_req, res) => {
  res.send({ response: 'response 0' });
});

app.get('/test/express', (_req, res) => {
  res.send({ response: 'response 1' });
});

app.get(/\/test\/regex/, (_req, res) => {
  res.send({ response: 'response 2' });
});

app.get(['/test/array1', /\/test\/array[2-9]/], (_req, res) => {
  res.send({ response: 'response 3' });
});

app.get(['/test/arr/:id', /\/test\/arr[0-9]*\/required(path)?(\/optionalPath)?\/(lastParam)?/], (_req, res) => {
  res.send({ response: 'response 4' });
});

app.post('/test-post', function (req, res) {
  res.send({ status: 'ok', body: req.body });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
