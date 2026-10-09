import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';
import * as http from 'http';

const app = express();

app.get('/ignored', async (_req, res) => {
  await fetch(`${process.env.SERVER_URL}/outgoing`);
  res.send({ status: 'ok' });
});

app.get('/ignored-http', async (_req, res) => {
  await makeHttpRequest(`${process.env.SERVER_URL}/outgoing`);
  res.send({ status: 'ok' });
});

startExpressServerAndSendPortToRunner(app);

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, httpRes => {
      httpRes.resume();
      httpRes.on('end', resolve);
    });
    request.on('error', reject);
  });
}
