import Router from '@koa/router';
import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import Koa from 'koa';

const port = 5698;

const app = new Koa();

// Registered first so it wraps every downstream middleware/route in its try/catch.
Sentry.setupKoaErrorHandler(app);

// Plain middleware -> produces a `middleware.koa` span named after the function.
app.use(async function simpleMiddleware(ctx, next) {
  await next();
});

const router = new Router();

router.get('/', ctx => {
  ctx.body = 'Hello World!';
});

router.get('/test-param/:id', ctx => {
  ctx.body = { id: ctx.params.id };
});

router.get('/error', () => {
  throw new Error('Sentry Test Error');
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(port, () => {
  sendPortToRunner(port);
});
