import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual LangChain instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
  const transactionPromise = waitForTransactionRequest(page, event => {
    return !!event.transaction?.includes('claude-3-haiku-20240307');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const req = await transactionPromise;

  const eventData = envelopeRequestParser(req);

  // Verify it's a gen_ai transaction
  expect(eventData.transaction).toBe('chat claude-3-haiku-20240307');
  expect(eventData.contexts?.trace?.op).toBe('gen_ai.chat');
  expect(eventData.contexts?.trace?.origin).toBe('auto.ai.langchain');
  expect(eventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'chat',
    'gen_ai.system': 'anthropic',
    'gen_ai.request.model': 'claude-3-haiku-20240307',
    'gen_ai.request.temperature': 0.7,
    'gen_ai.response.model': 'claude-3-haiku-20240307',
    'gen_ai.response.id': 'msg_mock123',
    'gen_ai.usage.input_tokens': 10,
    'gen_ai.usage.output_tokens': 15,
    'gen_ai.usage.total_tokens': 25,
  });
});
