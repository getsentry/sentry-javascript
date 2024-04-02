import * as Sentry from '@sentry/node';
import { TRPCError, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { z } from 'zod';

declare global {
  namespace globalThis {
    var transactionIds: string[];
  }
}

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});

const app = express();
const port = 3030;

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (req, res) {
  Sentry.withActiveSpan(null, async () => {
    Sentry.startSpan({ name: 'test-transaction', op: 'e2e-test' }, () => {
      Sentry.startSpan({ name: 'test-span' }, () => undefined);
    });

    await Sentry.flush();

    res.send({
      transactionIds: global.transactionIds || [],
    });
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-local-variables-uncaught', function (req, res) {
  const randomVariableToRecord = Math.random();
  throw new Error(`Uncaught Local Variable Error - ${JSON.stringify({ randomVariableToRecord })}`);
});

app.get('/test-local-variables-caught', function (req, res) {
  const randomVariableToRecord = Math.random();

  let exceptionId: string;
  try {
    throw new Error('Local Variable Error');
  } catch (e) {
    exceptionId = Sentry.captureException(e);
  }

  res.send({ exceptionId, randomVariableToRecord });
});

Sentry.setupExpressErrorHandler(app);

// @ts-ignore
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + '\n');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

Sentry.addEventProcessor(event => {
  global.transactionIds = global.transactionIds || [];

  if (event.type === 'transaction') {
    const eventId = event.event_id;

    if (eventId) {
      global.transactionIds.push(eventId);
    }
  }

  return event;
});

export const t = initTRPC.context<Context>().create();

const procedure = t.procedure.use(Sentry.trpcMiddleware({ attachRpcInput: true }));

export const appRouter = t.router({
  getSomething: procedure.input(z.string()).query(opts => {
    return { id: opts.input, name: 'Bilbo' };
  }),
  createSomething: procedure.mutation(async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return { success: true };
  }),
  crashSomething: procedure.mutation(() => {
    throw new Error('I crashed in a trpc handler');
  }),
  dontFindSomething: procedure.mutation(() => {
    throw new TRPCError({ code: 'NOT_FOUND', cause: new Error('Page not found') });
  }),
});

export type AppRouter = typeof appRouter;

const createContext = () => ({ someStaticValue: 'asdf' });
type Context = Awaited<ReturnType<typeof createContext>>;

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);
