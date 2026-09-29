import express from 'express';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const MIDDLEWARE_COUNT = 12;

const app = express();

// More synchronous middleware than Node's default of 10 listeners per event, so
// layer spans that stayed open until `next()` returned would pile up a response
// `finish` listener per layer.
for (let i = 0; i < MIDDLEWARE_COUNT; i++) {
  app.use(function syncMiddleware(_req, _res, next) {
    next();
  });
}

app.get('/test/express', (_req, res) => {
  const finishListeners = res.listenerCount('finish');

  // Synchronous work that a middleware span still open around `next()` would absorb.
  const until = Date.now() + 50;
  while (Date.now() < until) {
    // busy-wait
  }

  res.send({ finishListeners });
});

startExpressServerAndSendPortToRunner(app);
