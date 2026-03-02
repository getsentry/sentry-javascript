import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { SerializedLog, SerializedLogContainer } from '@sentry/core';

async function collectLogItems(baseURL: string, endpoint: string): Promise<SerializedLog[]> {
  const items: SerializedLog[] = [];

  const logEnvelopePromise = waitForEnvelopeItem('node-effect', envelope => {
    if (envelope[0].type !== 'log') return false;
    const container = envelope[1] as SerializedLogContainer;
    items.push(...container.items);
    return container.items.some(item => item.body?.toString().includes('Test'));
  });

  await fetch(`${baseURL}${endpoint}`);
  await logEnvelopePromise;

  return items;
}

test('Captures Effect logs with correct severity levels', async ({ baseURL }) => {
  const items = await collectLogItems(baseURL!, '/test-effect-log');

  expect(items.length).toBeGreaterThan(0);

  const infoLog = items.find(item => item.body?.toString().includes('Test info log message'));
  expect(infoLog).toBeDefined();
  expect(infoLog?.severity_number).toBe(9);

  const warningLog = items.find(item => item.body?.toString().includes('Test warning log message'));
  expect(warningLog).toBeDefined();
  expect(warningLog?.severity_number).toBe(13);

  const errorLog = items.find(item => item.body?.toString().includes('Test error log message'));
  expect(errorLog).toBeDefined();
  expect(errorLog?.severity_number).toBe(17);

  for (const item of items) {
    expect(item.body).toBeDefined();
    expect(item.severity_number).toBeDefined();
    expect(item.timestamp).toBeDefined();
  }
});

test('Effect logs are associated with trace context when inside a span', async ({ baseURL }) => {
  const logEnvelopePromise = waitForEnvelopeItem('node-effect', envelope => {
    if (envelope[0].type !== 'log') return false;
    const container = envelope[1] as SerializedLogContainer;
    return container.items.some(item => item.body?.toString().includes('Starting effect span test'));
  });

  await fetch(`${baseURL}/test-effect-span`);

  const logEnvelope = await logEnvelopePromise;
  const container = logEnvelope[1] as SerializedLogContainer;
  const spanLog = container.items.find(item => item.body?.toString().includes('Starting effect span test'));

  expect(spanLog).toBeDefined();
  expect(spanLog?.trace_id).toBeDefined();
});
