import type { Envelope } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

interface TriggerResponse {
  id: string;
}

interface StatusResponse {
  id: string;
  status: { status: string };
}

async function waitForWorkflowStatus(
  makeRequest: <T>(method: 'get' | 'post', path: string) => Promise<T | undefined>,
  workflowId: string,
): Promise<StatusResponse | undefined> {
  for (let i = 0; i < 30; i++) {
    const status = await makeRequest<StatusResponse>('get', `/workflow-status/${workflowId}`);
    if (status?.status?.status === 'errored' || status?.status?.status === 'complete') {
      return status;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return undefined;
}

const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it('With step context, only one error is captured on final retry attempt', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception).toBeDefined();

      const exception = itemBody.exception as { values?: Array<{ value?: string }> };
      expect(exception?.values?.[0]?.value).toBe('Intentional failure for retry test');
    })
    .expect(flushMarkerMatcher)
    .start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?failCount=3');

  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('errored');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});

it('No error event when step eventually succeeds within retry limit', async ({ signal }) => {
  const runner = createRunner(__dirname).expect(flushMarkerMatcher).start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?failCount=1');
  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('complete');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});

it('Manually captured exceptions are always sent on every attempt', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expectN(3, (envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception).toBeDefined();

      const exception = itemBody.exception as { values?: Array<{ value?: string }> };
      expect(exception?.values?.[0]?.value).toMatch(/^Manual capture on attempt \d+$/);
    })
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception).toBeDefined();

      const exception = itemBody.exception as { values?: Array<{ value?: string }> };
      expect(exception?.values?.[0]?.value).toBe('Intentional failure for retry test');
    })
    .expect(flushMarkerMatcher)
    .unordered()
    .start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?failCount=3&captureManual=true');
  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('errored');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});
