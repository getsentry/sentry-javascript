import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Koa from 'koa';

Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = new Koa();

app.use(async (ctx, next) => {
  const tunnelResponse = Sentry.handleTunnelRequestIfMatched(ctx.req, ctx.res);
  if (tunnelResponse) {
    await tunnelResponse;
    return;
  }

  await next();
});

app.use(ctx => {
  // `/done` is the test's last request, so the runner only stops the scenario after every check.
  if (ctx.path === '/done') {
    Sentry.captureMessage('done');
  }
  ctx.body = ctx.path === '/dsn' ? process.env.SENTRY_DSN : 'app';
});

const server = app.listen(0, () => {
  sendPortToRunner(server.address().port);
});
