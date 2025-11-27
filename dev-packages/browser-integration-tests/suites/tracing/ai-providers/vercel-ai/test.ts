import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual Vercel AI instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
  const transactionPromise = waitForTransactionRequest(page, event => {
    return !!event.transaction?.includes('generateText');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const req = await transactionPromise;

  const eventData = envelopeRequestParser(req);

  // Verify it's a gen_ai transaction
  expect(eventData.transaction).toBe('generateText');
  expect(eventData.contexts?.trace?.op).toBe('gen_ai.invoke_agent');
  expect(eventData.contexts?.trace?.origin).toBe('auto.vercelai.otel');
  expect(eventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.response.model': 'gpt-4-turbo',
  });
});
