import express from 'express';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { ProfilingIntegration } from '../../src';

const app = express();

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  tracesSampleRate: 1,
  profilesSampleRate: 1,
  debug: true,
  integrations: [
    // enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // enable Express.js middleware tracing
    new Tracing.Integrations.Express({
      // to trace all requests to the default router
      app,
      // alternatively, you can specify the routes you want to trace:
      // router: someRouter,
    }),
    new ProfilingIntegration(),
  ],
});

// The request handler must be the first middleware on the app
app.use(Sentry.Handlers.tracingHandler());
app.use(Sentry.Handlers.requestHandler());

// All controllers should live here
app.get('/', function rootHandler(_req, res) {
  res.end('Hello world!');
});

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.Handlers.errorHandler());

// Optional fallthrough error handler
app.use(function onError(_err: Error, _req: any, res: any, _next: any) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
