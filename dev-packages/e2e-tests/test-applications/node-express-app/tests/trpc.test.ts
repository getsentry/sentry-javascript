import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/app';

const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_TEST_PROJECT;
const EVENT_POLLING_TIMEOUT = 90_000;

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
