import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';

test('Logs from different requests have different trace IDs', async ({ baseURL }) => {
  const logEnvelopePromise1 = waitForEnvelopeItem('node-otel-without-tracing', async envelopeItem => {
    const [itemHeader, itemPayload] = envelopeItem;
    if (itemHeader.type === 'log') {
      const logItems = itemPayload as { items: Array<{ body: string; trace_id?: string }> };
      return logItems.items.some(item => item.body === 'test-log-1');
    }
    return false;
  });

  const logEnvelopePromise2 = waitForEnvelopeItem('node-otel-without-tracing', async envelopeItem => {
    const [itemHeader, itemPayload] = envelopeItem;
    if (itemHeader.type === 'log') {
      const logItems = itemPayload as { items: Array<{ body: string; trace_id?: string }> };
      return logItems.items.some(item => item.body === 'test-log-2');
    }
    return false;
  });

  // Make two requests to different routes (each Express route is an isolation scope)
  await fetch(`${baseURL}/test-logs/1`);
  await fetch(`${baseURL}/test-logs/2`);

  const logEnvelope1 = await logEnvelopePromise1;
  const logEnvelope2 = await logEnvelopePromise2;

  const logPayload1 = logEnvelope1[1] as { items: Array<{ body: string; trace_id?: string }> };
  const logPayload2 = logEnvelope2[1] as { items: Array<{ body: string; trace_id?: string }> };

  const log1 = logPayload1.items.find(item => item.body === 'test-log-1');
  const log2 = logPayload2.items.find(item => item.body === 'test-log-2');

  const traceId1 = log1?.trace_id;
  const traceId2 = log2?.trace_id;

  expect(traceId1).toMatch(/[a-f0-9]{32}/);
  expect(traceId2).toMatch(/[a-f0-9]{32}/);
  expect(traceId1).not.toBe(traceId2);
});
