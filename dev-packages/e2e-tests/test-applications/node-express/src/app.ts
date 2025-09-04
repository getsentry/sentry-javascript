import * as Sentry from '@sentry/node';

declare global {
  namespace globalThis {
    var transactionIds: string[];
  }
}

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  enableLogs: true,
});

import { TRPCError, initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import { z } from 'zod';
import { mcpRouter } from './mcp';

const app = express();
const port = 3030;

app.use(express.json());

app.use(mcpRouter);

app.get('/crash-in-with-monitor/:id', async (req, res) => {
  try {
    await Sentry.withMonitor('express-crash', async () => {
      throw new Error(`This is an exception withMonitor: ${req.params.id}`);
    });
    res.sendStatus(200);
  } catch (error: any) {
    res.status(500);
    res.send({ message: error.message, pid: process.pid });
  }
});

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-log', function (req, res) {
  Sentry.logger.debug('Accessed /test-log route');
  res.send({ message: 'Log sent' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', function (_req, res) {
  Sentry.startSpan({ name: 'test-span' }, () => undefined);

  res.send({ status: 'ok' });
});
app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get('/test-exception/:id', function (req, _res) {
  throw new Error(`This is an exception with id ${req.params.id}`);
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
  crashSomething: procedure
    .input(z.object({ nested: z.object({ nested: z.object({ nested: z.string() }) }) }))
    .mutation(() => {
      throw new Error('I crashed in a trpc handler');
    }),
  badRequest: procedure.mutation(() => {
    throw new TRPCError({ code: 'BAD_REQUEST', cause: new Error('Bad Request') });
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
