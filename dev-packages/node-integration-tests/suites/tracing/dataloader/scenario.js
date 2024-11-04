const { loggingTransport, startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.dataloaderIntegration()],
});

const PORT = 8008;

// Stop the process from exiting before the transaction is sent
setInterval(() => {}, 1000);

const run = async () => {
  const express = require('express');
  const Dataloader = require('dataloader');

  const app = express();
  const dataloader = new Dataloader(async keys => keys.map((_, idx) => idx), {
    cache: false,
  });

  app.get('/', (req, res) => {
    const user = dataloader.load('user-1');
    res.send(user);
  });

  startExpressServerAndSendPortToRunner(app, PORT);
};

run();
