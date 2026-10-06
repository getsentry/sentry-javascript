import { expect, test } from '@playwright/test';
import { waitForError, collectStreamedSpans } from '@sentry-internal/test-utils';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../src/app';

test('Records span for trpc query', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpans('tsx-express', spans =>
    spans.some(
      segment =>
        segment.is_segment &&
        segment.name === 'GET /trpc' &&
        !!spans.filter(span => !span.is_segment).find(span => span.name === 'trpc/getSomething'),
    ),
  );

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.getSomething.query('foobar');

  await expect(segmentEventPromise).resolves.toBeDefined();
  const segmentSpans = await segmentEventPromise;
  const segment = segmentSpans.find(
    segment =>
      segment.is_segment &&
      segment.name === 'GET /trpc' &&
      !!segmentSpans
        .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
        .find(span => span.name === 'trpc/getSomething'),
  )!;

  expect(
    segmentSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
      .filter(span => span.name === `trpc/getSomething`),
  ).toEqual([
    expect.objectContaining({
      name: `trpc/getSomething`,
      attributes: expect.objectContaining({
        'sentry.op': { value: 'rpc', type: 'string' },
        'sentry.origin': { value: 'auto.rpc.trpc', type: 'string' },
      }),
    }),
  ]);
});

test('Records span for trpc mutation', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpans('tsx-express', spans =>
    spans.some(
      segment =>
        segment.is_segment &&
        segment.name === 'POST /trpc' &&
        !!spans.filter(span => !span.is_segment).find(span => span.name === 'trpc/createSomething'),
    ),
  );

  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/trpc`,
      }),
    ],
  });

  await trpcClient.createSomething.mutate();

  await expect(segmentEventPromise).resolves.toBeDefined();
  const segmentSpans = await segmentEventPromise;
  const segment = segmentSpans.find(
    segment =>
      segment.is_segment &&
      segment.name === 'POST /trpc' &&
      !!segmentSpans
        .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
        .find(span => span.name === 'trpc/createSomething'),
  )!;

  expect(
    segmentSpans
      .filter(span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id)
      .filter(span => span.name === `trpc/createSomething`),
  ).toEqual([
    expect.objectContaining({
      name: `trpc/createSomething`,
      attributes: expect.objectContaining({
        'sentry.op': { value: 'rpc', type: 'string' },
        'sentry.origin': { value: 'auto.rpc.trpc', type: 'string' },
      }),
    }),
  ]);
});

test('Records span and error for a crashing trpc handler', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpans('tsx-express', spans =>
    spans.some(
      segment =>
        segment.is_segment &&
        segment.name === 'POST /trpc' &&
        !!spans.filter(span => !span.is_segment).find(span => span.name === 'trpc/crashSomething'),
    ),
  );

  const errorEventPromise = waitForError('tsx-express', errorEvent => {
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

  await expect(segmentEventPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();

  expect((await errorEventPromise).contexts?.trpc?.['procedure_type']).toBe('mutation');
  expect((await errorEventPromise).contexts?.trpc?.['procedure_path']).toBe('crashSomething');

  // Should record nested context
  expect((await errorEventPromise).contexts?.trpc?.['input']).toEqual({
    nested: {
      nested: {
        nested: 'foobar',
      },
    },
  });
});

test('Records span and error for a trpc handler that returns a status code', async ({ baseURL }) => {
  const segmentEventPromise = collectStreamedSpans('tsx-express', spans =>
    spans.some(
      segment =>
        segment.is_segment &&
        segment.name === 'POST /trpc' &&
        !!spans.filter(span => !span.is_segment).find(span => span.name === 'trpc/badRequest'),
    ),
  );

  const errorEventPromise = waitForError('tsx-express', errorEvent => {
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

  await expect(segmentEventPromise).resolves.toBeDefined();
  await expect(errorEventPromise).resolves.toBeDefined();
});
