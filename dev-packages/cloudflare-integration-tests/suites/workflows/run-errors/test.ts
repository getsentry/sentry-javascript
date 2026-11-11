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

interface SentException {
  type?: string;
  value?: string;
  mechanism?: { handled?: boolean; type?: string };
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

// The flush marker is sent after the instance has ended and must arrive directly after the expected
// error event. A second error event for the same failure would arrive in its place and fail the test.
const flushMarkerMatcher = (envelope: Envelope): void => {
  const [, items] = envelope;
  const [itemHeader, itemBody] = items[0] as [{ type: string }, Record<string, unknown>];

  expect(itemHeader.type).toBe('event');
  expect(itemBody.message).toBe('flush-marker');
};

it.for([
  { mode: 'throw-before-step', type: 'TypeError', value: 'Thrown before any step' },
  { mode: 'non-retryable-before-step', type: 'NonRetryableError', value: 'Non-retryable before any step' },
  { mode: 'throw-after-step', type: 'Error', value: 'Thrown after a successful step' },
  { mode: 'wait-for-event-timeout', type: 'Error', value: expect.stringContaining('timed out') },
  { mode: 'step-timeout', type: 'Error', value: expect.stringContaining('timed out') },
  { mode: 'non-serializable', type: 'Error', value: expect.stringContaining('not serialisable') },
])(
  'captures one unhandled error when run() fails outside a step callback ($mode)',
  async ({ mode, type, value }, { signal }) => {
    const runner = createRunner(__dirname)
      .expect((envelope: Envelope): void => {
        const [, items] = envelope;
        const [itemHeader, itemBody] = items[0] as [{ type: string }, { exception?: { values?: SentException[] } }];

        expect(itemHeader.type).toBe('event');
        expect(itemBody.exception?.values?.[0]).toMatchObject({
          type,
          value,
          mechanism: { handled: false, type: 'auto.faas.cloudflare.workflow' },
        });
      })
      .expect(flushMarkerMatcher)
      .start(signal);

    const trigger = await runner.makeRequest<TriggerResponse>('get', `/trigger-workflow?mode=${mode}`);
    expect(trigger?.id).toBeDefined();

    const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
    expect(status?.status?.status).toBe('errored');

    await runner.makeRequest('get', '/flush-marker');
    await runner.completed();
  },
);

it('captures an error thrown inside a step callback only one time', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, { exception?: { values?: SentException[] } }];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception?.values?.[0]).toMatchObject({
        type: 'Error',
        value: 'Thrown inside the step callback',
        mechanism: { handled: true, type: 'auto.faas.cloudflare.workflow' },
      });
    })
    .expect(flushMarkerMatcher)
    .start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?mode=throw-in-step');
  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('errored');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});

it('captures no second error when run() catches a failed step', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, { exception?: { values?: SentException[] } }];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception?.values?.[0]?.value).toBe('Thrown inside the step callback');
    })
    .expect(flushMarkerMatcher)
    .start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?mode=caught-step-error');
  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('complete');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});

it('captures the step error and the new error when run() replaces a failed step error', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, { exception?: { values?: SentException[] } }];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception?.values?.[0]).toMatchObject({
        value: 'Thrown inside the step callback',
        mechanism: { handled: true, type: 'auto.faas.cloudflare.workflow' },
      });
    })
    .expect((envelope: Envelope): void => {
      const [, items] = envelope;
      const [itemHeader, itemBody] = items[0] as [{ type: string }, { exception?: { values?: SentException[] } }];

      expect(itemHeader.type).toBe('event');
      expect(itemBody.exception?.values?.[0]).toMatchObject({
        value: 'Thrown by run() after the failed step',
        mechanism: { handled: false, type: 'auto.faas.cloudflare.workflow' },
      });
    })
    .expect(flushMarkerMatcher)
    .start(signal);

  const trigger = await runner.makeRequest<TriggerResponse>('get', '/trigger-workflow?mode=rethrow-new-error');
  expect(trigger?.id).toBeDefined();

  const status = await waitForWorkflowStatus(runner.makeRequest.bind(runner), trigger!.id);
  expect(status?.status?.status).toBe('errored');

  await runner.makeRequest('get', '/flush-marker');
  await runner.completed();
});
