import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../../runner';

it('traces a workflow that calls a durable object with the same trace id', async ({ signal }) => {
  let workflowTraceId: string | undefined;
  let workflowSpanId: string | undefined;
  let doTraceId: string | undefined;
  let doParentSpanId: string | undefined;

  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'function.step.do',
              data: expect.objectContaining({
                'sentry.op': 'function.step.do',
                'sentry.origin': 'auto.faas.cloudflare.workflow',
              }),
              origin: 'auto.faas.cloudflare.workflow',
            }),
          }),
          transaction: 'workflow-env-test',
        }),
      );
      workflowTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      workflowSpanId = transactionEvent.contexts?.trace?.span_id as string;
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /workflow-test',
        }),
      );
      doTraceId = transactionEvent.contexts?.trace?.trace_id as string;
      doParentSpanId = transactionEvent.contexts?.trace?.parent_span_id as string;
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();

  expect(workflowTraceId).toBeDefined();
  expect(doTraceId).toBeDefined();
  expect(workflowTraceId).toBe(doTraceId);

  expect(workflowSpanId).toBeDefined();
  expect(doParentSpanId).toBeDefined();
  expect(doParentSpanId).toBe(workflowSpanId);
});
