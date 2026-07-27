import { beforeAll, expect, it } from 'vitest';
import type { TransactionEvent } from '@sentry/core';
import { build } from 'vite';
import { createRunner } from '../../../runner';

const AGENT_INSTANCE = 'orchestrion-instance';

// Build the worker with the orchestrion diagnostics-channel injection (see vite.config.mts) so the
// `agents` package methods are channel-injected and `__SENTRY_ORCHESTRION__.bundler` is set before
// wrangler serves the bundle.
beforeAll(async () => {
  await build({ configFile: `${__dirname}/vite.config.mts`, root: __dirname, logLevel: 'warn' });
}, 120_000);

it('creates the schedule-task span via the injected channel (orchestrion path)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;
      expect(transaction.transaction).toBe('alarm');

      const scheduleSpan = (transaction.spans ?? []).find(
        span => span.op === 'function' && span.description === 'myTask',
      );
      expect(scheduleSpan).toEqual(
        expect.objectContaining({
          op: 'function',
          description: 'myTask',
          origin: 'auto.faas.cloudflare.agents',
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/agents/my-agent/${AGENT_INSTANCE}/schedule`);
  await runner.completed();
});

it('creates the callable-RPC span via the monkey-patch fallback (orchestrion cannot inject closures)', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      const rpcSpan = (transaction.spans ?? []).find(span => span.op === 'rpc' && span.description === 'greet');
      expect(rpcSpan).toEqual(
        expect.objectContaining({
          op: 'rpc',
          description: 'greet',
          origin: 'auto.faas.cloudflare.agents',
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.agents.callRpc({ binding: 'my-agent', instance: AGENT_INSTANCE, method: 'greet', args: ['World'] });
  await runner.completed();
});

it('creates the agent_start span via the monkey-patch fallback on a cold start (orchestrion cannot inject onStart)', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      const startSpan = (transaction.spans ?? []).find(
        span => span.op === 'function' && span.description === 'agent_start',
      );
      expect(startSpan).toEqual(
        expect.objectContaining({
          op: 'function',
          description: 'agent_start',
          origin: 'auto.faas.cloudflare.agents',
        }),
      );
    })
    .unordered()
    .start(signal);

  // A fresh instance name forces a cold start, so `onStart` runs (and is spanned by the fallback).
  await runner.makeRequest('get', `/agents/my-agent/cold-${Date.now()}/fiber`);
  await runner.completed();
});

it('creates the fiber span via the injected channel (orchestrion path)', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transaction = envelope[1]?.[0]?.[1] as TransactionEvent;

      const fiberSpan = (transaction.spans ?? []).find(
        span => span.op === 'function' && span.description === 'myFiber',
      );
      expect(fiberSpan).toEqual(
        expect.objectContaining({
          op: 'function',
          description: 'myFiber',
          origin: 'auto.faas.cloudflare.agents',
          data: expect.objectContaining({
            'cloudflare.agent.fiber.id': expect.any(String),
            'cloudflare.agent.fiber.name': 'myFiber',
          }),
        }),
      );
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/agents/my-agent/${AGENT_INSTANCE}/fiber`);
  await runner.completed();
});
