import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import Dataloader from 'dataloader';
import express from 'express';

const PORT = 8008;

const run = async () => {
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
