import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual OpenAI instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
  // Listen for console logs
  page.on('console', msg => {
    // eslint-disable-next-line no-console
    console.log(`[Browser Console ${msg.type()}]`, msg.text());
  });

  // Listen for page errors
  page.on('pageerror', error => {
    // eslint-disable-next-line no-console
    console.error('[Browser Error]', error);
  });

  const transactionPromise = waitForTransactionRequest(page, event => {
    // eslint-disable-next-line no-console
    console.log('[Test] Received transaction event:', JSON.stringify(event, null, 2));
    return !!event.transaction?.includes('gpt-3.5-turbo');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  // eslint-disable-next-line no-console
  console.log('[Test] Navigating to URL:', url);
  await page.goto(url);

  // eslint-disable-next-line no-console
  console.log('[Test] Waiting for transaction...');
  const req = await transactionPromise;
  // eslint-disable-next-line no-console
  console.log('[Test] Transaction received!');

  const eventData = envelopeRequestParser(req);
  // eslint-disable-next-line no-console
  console.log('[Test] Parsed event data:', JSON.stringify(eventData, null, 2));

  // Verify it's a gen_ai transaction
  expect(eventData.transaction).toBe('chat gpt-3.5-turbo');
  expect(eventData.contexts?.trace?.op).toBe('gen_ai.chat');
  expect(eventData.contexts?.trace?.origin).toBe('auto.ai.openai');
  expect(eventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'chat',
    'gen_ai.system': 'openai',
    'gen_ai.request.model': 'gpt-3.5-turbo',
    'gen_ai.request.temperature': 0.7,
    'gen_ai.response.model': 'gpt-3.5-turbo',
    'gen_ai.response.id': 'chatcmpl-mock123',
    'gen_ai.usage.input_tokens': 10,
    'gen_ai.usage.output_tokens': 15,
    'gen_ai.usage.total_tokens': 25,
  });
});
