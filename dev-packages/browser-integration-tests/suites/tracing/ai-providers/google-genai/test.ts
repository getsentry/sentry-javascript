import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual Google GenAI instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
  const transactionPromise = waitForTransactionRequest(page, event => {
    return !!event.transaction?.includes('gemini-1.5-pro');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const req = await transactionPromise;

  const eventData = envelopeRequestParser(req);

  // Verify it's a gen_ai transaction
  expect(eventData.transaction).toBe('chat gemini-1.5-pro create');
  expect(eventData.contexts?.trace?.op).toBe('gen_ai.chat');
  expect(eventData.contexts?.trace?.origin).toBe('auto.ai.google_genai');
  expect(eventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'chat',
    'gen_ai.system': 'google_genai',
    'gen_ai.request.model': 'gemini-1.5-pro',
  });
});
