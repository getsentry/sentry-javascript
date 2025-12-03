import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForTransactionRequest } from '../../../../utils/helpers';

// These tests are not exhaustive because the instrumentation is
// already tested in the node integration tests and we merely
// want to test that the instrumentation does not crash in the browser
// and that gen_ai transactions are sent.

sentryTest('manual LangGraph instrumentation sends gen_ai transactions', async ({ getLocalTestUrl, page }) => {
  const createTransactionPromise = waitForTransactionRequest(page, event => {
    return !!event.transaction?.includes('create_agent mock-graph');
  });

  const invokeTransactionPromise = waitForTransactionRequest(page, event => {
    return !!event.transaction?.includes('invoke_agent mock-graph');
  });

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const createReq = await createTransactionPromise;
  const invokeReq = await invokeTransactionPromise;

  const createEventData = envelopeRequestParser(createReq);
  const invokeEventData = envelopeRequestParser(invokeReq);

  // Verify create_agent transaction
  expect(createEventData.transaction).toBe('create_agent mock-graph');
  expect(createEventData.contexts?.trace?.op).toBe('gen_ai.create_agent');
  expect(createEventData.contexts?.trace?.origin).toBe('auto.ai.langgraph');
  expect(createEventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'create_agent',
    'gen_ai.agent.name': 'mock-graph',
  });

  // Verify invoke_agent transaction
  expect(invokeEventData.transaction).toBe('invoke_agent mock-graph');
  expect(invokeEventData.contexts?.trace?.op).toBe('gen_ai.invoke_agent');
  expect(invokeEventData.contexts?.trace?.origin).toBe('auto.ai.langgraph');
  expect(invokeEventData.contexts?.trace?.data).toMatchObject({
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.agent.name': 'mock-graph',
  });
});
