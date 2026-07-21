import type { TransactionEvent } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// One worker, three auto-instrumented shapes wrapped in a single Vite build:
// the default handler, a config-bound Durable Object, and a structurally
// detected self-bound WorkerEntrypoint. Each request drives one of them.

it('auto-instruments a Durable Object alongside the default handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.cloudflare');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.contexts?.trace?.origin).toBe('auto.faas.cloudflare.durable_object');
    })
    .start(signal);

  await runner.makeRequest('get', '/do');
  await runner.completed();
});

it('auto-instruments a self-bound WorkerEntrypoint alongside the default handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /entrypoint');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transactionEvent.transaction).toBe('GET /greet');
      expect(transactionEvent.contexts?.trace?.op).toBe('http.server');
    })
    .start(signal);

  await runner.makeRequest('get', '/entrypoint');
  await runner.completed();
});
