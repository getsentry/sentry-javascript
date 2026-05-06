import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/app';

test('Should record streamed span for trpc query', async ({ baseURL }) => {
  const trpcSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'trpc/getSomething' && getSpanOp(span) === 'rpc.server';
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.getSomething.query('foobar');

  const trpcSpan = await trpcSpanPromise;
  expect(trpcSpan).toBeDefined();
  expect(trpcSpan.name).toBe('trpc/getSomething');
  expect(getSpanOp(trpcSpan)).toBe('rpc.server');
  expect(trpcSpan.attributes?.['sentry.origin']?.value).toBe('auto.rpc.trpc');
});

test('Should record streamed span for trpc mutation', async ({ baseURL }) => {
  const trpcSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'trpc/createSomething' && getSpanOp(span) === 'rpc.server';
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.createSomething.mutate();

  const trpcSpan = await trpcSpanPromise;
  expect(trpcSpan).toBeDefined();
  expect(trpcSpan.name).toBe('trpc/createSomething');
  expect(getSpanOp(trpcSpan)).toBe('rpc.server');
  expect(trpcSpan.attributes?.['sentry.origin']?.value).toBe('auto.rpc.trpc');
});

test('Should record streamed span and error for a crashing trpc handler', async ({ baseURL }) => {
  const trpcSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'trpc/crashSomething' && getSpanOp(span) === 'rpc.server';
  });

  const errorEventPromise = waitForError('node-express-streaming', errorEvent => {
    return !!errorEvent?.exception?.values?.some(exception => exception.value?.includes('I crashed in a trpc handler'));
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await expect(trpcClient.crashSomething.mutate({ nested: { nested: { nested: 'foobar' } } })).rejects.toBeDefined();

  await expect(trpcSpanPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();

  expect((await errorEventPromise).contexts?.trpc?.['procedure_type']).toBe('mutation');
  expect((await errorEventPromise).contexts?.trpc?.['procedure_path']).toBe('crashSomething');

  expect((await errorEventPromise).contexts?.trpc?.['input']).toEqual({
    nested: {
      nested: {
        nested: 'foobar',
      },
    },
  });
});

test('Should record streamed span and error for a trpc handler that returns a status code', async ({ baseURL }) => {
  const trpcSpanPromise = waitForStreamedSpan('node-express-streaming', span => {
    return span.name === 'trpc/badRequest' && getSpanOp(span) === 'rpc.server';
  });

  const errorEventPromise = waitForError('node-express-streaming', errorEvent => {
    return !!errorEvent?.exception?.values?.some(exception => exception.value?.includes('Bad Request'));
  });

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await expect(trpcClient.badRequest.mutate()).rejects.toBeDefined();

  await expect(trpcSpanPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();
});
