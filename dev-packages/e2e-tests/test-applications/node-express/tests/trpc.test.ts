import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/app';

test('Should record span for trpc query', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /trpc' &&
      !!transactionEvent.spans?.find(span => span.description === 'trpc/getSomething')
    );
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

  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.op': 'rpc.server',
        'sentry.origin': 'auto.rpc.trpc',
      }),
      description: `trpc/getSomething`,
    }),
  );
});

test('Should record transaction for trpc mutation', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent.transaction === 'POST /trpc' &&
      !!transactionEvent.spans?.find(span => span.description === 'trpc/createSomething')
    );
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

  expect(transaction.spans).toContainEqual(
    expect.objectContaining({
      data: expect.objectContaining({
        'sentry.op': 'rpc.server',
        'sentry.origin': 'auto.rpc.trpc',
      }),
      description: `trpc/createSomething`,
    }),
  );
});

test('Should record transaction and error for a crashing trpc handler', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent.transaction === 'POST /trpc' &&
      !!transactionEvent.spans?.find(span => span.description === 'trpc/crashSomething')
    );
  });

  const errorEventPromise = waitForError('node-express', errorEvent => {
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

  expect((await errorEventPromise).contexts?.trpc?.['procedure_type']).toBe('mutation');
  expect((await errorEventPromise).contexts?.trpc?.['procedure_path']).toBe('crashSomething');
});

test('Should record transaction and error for a trpc handler that returns a status code', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('node-express', transactionEvent => {
    return (
      transactionEvent.transaction === 'POST /trpc' &&
      !!transactionEvent.spans?.find(span => span.description === 'trpc/dontFindSomething')
    );
  });

  const errorEventPromise = waitForError('node-express', errorEvent => {
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
