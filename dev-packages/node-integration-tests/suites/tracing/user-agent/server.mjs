import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';

const app = express();

app.get('/test', async (_req, res) => {
  Sentry.startSpan({ name: 'child-span' }, () => {
    // noop
  });

  await fetch(`${process.env.SERVER_URL}/fetch`, { headers: { 'User-Agent': 'outgoing-fetch-agent' } });
  await makeHttpRequest(`${process.env.SERVER_URL}/http`, { 'User-Agent': 'outgoing-http-agent' });

  res.send({ response: 'ok' });
});

startExpressServerAndSendPortToRunner(app);

function makeHttpRequest(url, headers) {
  return new Promise(resolve => {
    http
      .request(url, { headers }, res => {
        res.on('data', () => {});
        res.on('end', resolve);
      })
      .end();
  });
}
