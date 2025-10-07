import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual Anthropic instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
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
    return !!event.transaction?.includes('claude-3-haiku-20240307');
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
  expect(eventData.transaction).toBe('messages claude-3-haiku-20240307');
  expect(eventData.contexts?.trace?.op).toBe('gen_ai.messages');
  expect(eventData.contexts?.trace?.origin).toBe('auto.ai.anthropic');
  expect(eventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'messages',
    'gen_ai.system': 'anthropic',
    'gen_ai.request.model': 'claude-3-haiku-20240307',
    'gen_ai.request.temperature': 0.7,
    'gen_ai.response.model': 'claude-3-haiku-20240307',
    'gen_ai.response.id': 'msg_mock123',
    'gen_ai.usage.input_tokens': 10,
    'gen_ai.usage.output_tokens': 15,
  });
});
