import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import Dataloader from 'dataloader';
import express from 'express';

const PORT = 8008;

const batchLoadFn = async keys => keys.map((_, idx) => idx);

const run = async () => {
  const app = express();

  app.get('/load', async (_req, res) => {
    const dataloader = new Dataloader(batchLoadFn, { cache: false });
    const user = await dataloader.load('user-1');
    res.send({ user });
  });

  app.get('/load-many', async (_req, res) => {
    const dataloader = new Dataloader(batchLoadFn, { cache: false });
    const users = await dataloader.loadMany(['user-1', 'user-2']);
    res.send({ users });
  });

  app.get('/cache-ops', async (_req, res) => {
    const dataloader = new Dataloader(batchLoadFn);
    dataloader.prime('user-1', 1);
    dataloader.clear('user-1');
    dataloader.clearAll();
    res.send({});
  });

  app.get('/named', async (_req, res) => {
    const dataloader = new Dataloader(batchLoadFn, { cache: false, name: 'usersLoader' });
    const user = await dataloader.load('user-1');
    res.send({ user });
  });

  startExpressServerAndSendPortToRunner(app, PORT);
};

run();
