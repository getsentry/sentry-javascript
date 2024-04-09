import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import axios, { AxiosError, AxiosResponse } from 'axios';
import type { AppRouter } from '../src/app';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

test('Sends exception to Sentry', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-error`);
  const { exceptionId } = data;

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionId}/`;

  console.log(`Polling for error eventId: ${exceptionId}`);

  await expect
    .poll(
      async () => {
        try {
          const response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });

          return response.status;
        } catch (e) {
          if (e instanceof AxiosError && e.response) {
            if (e.response.status !== 404) {
              throw e;
            } else {
              return e.response.status;
            }
          } else {
            throw e;
          }
        }
      },
      { timeout: EVENT_POLLING_TIMEOUT },
    )
    .toBe(200);
});

test('Sends transactions to Sentry', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-transaction`);
  const { transactionIds } = data;

  console.log(`Polling for transaction eventIds: ${JSON.stringify(transactionIds)}`);

  expect(transactionIds.length).toBeGreaterThan(0);

  await Promise.all(
    transactionIds.map(async (transactionId: string) => {
      const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${transactionId}/`;

      await expect
        .poll(
          async () => {
            try {
              const response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });

              return response.status;
            } catch (e) {
              if (e instanceof AxiosError && e.response) {
                if (e.response.status !== 404) {
                  throw e;
                } else {
                  return e.response.status;
                }
              } else {
                throw e;
              }
            }
          },
          { timeout: EVENT_POLLING_TIMEOUT },
        )
        .toBe(200);
    }),
  );
});

test('Should record caught exceptions with local variable', async ({ baseURL }) => {
  const { data } = await axios.get(`${baseURL}/test-local-variables-caught`);
  const { exceptionId } = data;

  const url = `https://sentry.io/api/0/projects/${sentryTestOrgSlug}/${sentryTestProject}/events/${exceptionId}/json/`;

  console.log(`Polling for error eventId: ${exceptionId}`);

  let response: AxiosResponse;

  await expect
    .poll(
      async () => {
        try {
          response = await axios.get(url, { headers: { Authorization: `Bearer ${authToken}` } });

          return response.status;
        } catch (e) {
          if (e instanceof AxiosError && e.response) {
            if (e.response.status !== 404) {
              throw e;
            } else {
              return e.response.status;
            }
          } else {
            throw e;
          }
        }
      },
      { timeout: EVENT_POLLING_TIMEOUT },
    )
    .toBe(200);

  const frames = response!.data.exception.values[0].stacktrace.frames;

  expect(frames[frames.length - 1].vars?.randomVariableToRecord).toBeDefined();
});

test('Should record uncaught exceptions with local variable', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express-app', errorEvent => {
    return !!errorEvent?.exception?.values?.[0]?.value?.includes('Uncaught Local Variable Error');
  });

  await axios.get(`${baseURL}/test-local-variables-uncaught`).catch(() => {
    // noop
  });

  const routehandlerError = await errorEventPromise;

  const frames = routehandlerError!.exception!.values![0]!.stacktrace!.frames!;

  expect(frames[frames.length - 1].vars?.randomVariableToRecord).toBeDefined();
});

test('Should record transaction for trpc query', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-app', transactionEvent => {
    return transactionEvent.transaction === 'trpc/getSomething';
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.getSomething.query('foobar');

  await expect(transactionEventPromise).resolves.toBeDefined();
  const transaction = await transactionEventPromise;

  expect(transaction.contexts?.trpc).toMatchObject({
    procedure_type: 'query',
    input: 'foobar',
  });
});

test('Should record transaction for trpc mutation', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-app', transactionEvent => {
    return transactionEvent.transaction === 'trpc/createSomething';
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.createSomething.mutate();

  await expect(transactionEventPromise).resolves.toBeDefined();
  const transaction = await transactionEventPromise;

  expect(transaction.contexts?.trpc).toMatchObject({
    procedure_type: 'mutation',
  });
});

test('Should record transaction and error for a crashing trpc handler', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-app', transactionEvent => {
    return transactionEvent.transaction === 'trpc/crashSomething';
  });

  const errorEventPromise = waitForError('node-express-app', errorEvent => {
    return !!errorEvent?.exception?.values?.some(exception => exception.value?.includes('I crashed in a trpc handler'));
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await expect(trpcClient.crashSomething.mutate()).rejects.toBeDefined();

  await expect(transactionEventPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();
});

test('Should record transaction and error for a trpc handler that returns a status code', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express-app', transactionEvent => {
    return transactionEvent.transaction === 'trpc/dontFindSomething';
  });

  const errorEventPromise = waitForError('node-express-app', errorEvent => {
    return !!errorEvent?.exception?.values?.some(exception => exception.value?.includes('Page not found'));
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await expect(trpcClient.dontFindSomething.mutate()).rejects.toBeDefined();

  await expect(transactionEventPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();
});
