import type { TransactionEvent } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import {
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '../../../../../packages/core/src/tracing/ai/gen-ai-attributes';
import { createRunner } from '../../../runner';

it('traces a basic callable method invocation', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transactionEvent.transaction).toBe('GET /increment');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.agents',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.agents',
              'cloudflare.agents.method': 'increment',
              'cloudflare.agents.agent': 'MockAgent',
            }),
            description: 'MockAgent.increment',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.cloudflare.agents',
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/increment');
  await runner.completed();
});

it('traces callable method with inputs when recordInputs=true', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transactionEvent.transaction).toBe('GET /process-task');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.agents',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.agents',
              'cloudflare.agents.method': 'processTask',
              'cloudflare.agents.agent': 'MockAgent',
              'cloudflare.agents.input': expect.stringContaining('task-1'),
            }),
            description: 'MockAgent.processTask',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.cloudflare.agents',
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/process-task?recordInputs=true');
  await runner.completed();
});

it('traces callable method with outputs when recordOutputs=true', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transactionEvent.transaction).toBe('GET /process-task');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.agents',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.agents',
              'cloudflare.agents.method': 'processTask',
              'cloudflare.agents.agent': 'MockAgent',
              'cloudflare.agents.output': expect.stringContaining('Processed task'),
            }),
            description: 'MockAgent.processTask',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.cloudflare.agents',
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/process-task?recordOutputs=true');
  await runner.completed();
});

it('traces callable method with state changes when recordStateChanges=true', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transactionEvent.transaction).toBe('GET /increment');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.agents',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.agents',
              'cloudflare.agents.method': 'increment',
              'cloudflare.agents.agent': 'MockAgent',
              'cloudflare.agents.state.before': expect.stringContaining('count'),
              'cloudflare.agents.state.after': expect.stringContaining('count'),
            }),
            description: 'MockAgent.increment',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.cloudflare.agents',
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/increment?recordStateChanges=true');
  await runner.completed();
});

it('handles Response outputs correctly', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('event')
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as TransactionEvent;

      expect(transactionEvent.transaction).toBe('GET /handle-request');
      expect(transactionEvent.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              [GEN_AI_OPERATION_NAME_ATTRIBUTE]: 'invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.invoke_agent',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ai.cloudflare.agents',
              [GEN_AI_SYSTEM_ATTRIBUTE]: 'cloudflare.agents',
              'cloudflare.agents.method': 'handleRequest',
              'cloudflare.agents.agent': 'MockAgent',
              'cloudflare.agents.output.type': 'Response',
              'cloudflare.agents.output.status': 200,
            }),
            description: 'MockAgent.handleRequest',
            op: 'gen_ai.invoke_agent',
            origin: 'auto.ai.cloudflare.agents',
          }),
        ]),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/handle-request?recordOutputs=true');
  await runner.completed();
});
