import { expect, test } from '@playwright/test';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import {
  EVENT_POLLING_OPTIONS,
  fetchSpanAttributes,
  fetchTrace,
  findTraceIdOfSpan,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';
import { newInstanceId, runAgentTurn } from './utils';

// Set by global-setup.ts once the worker for this run is deployed.
const workerUrl = process.env.E2E_TEST_WORKER_URL!;

/**
 * This app never calls `instrument()`. On Cloudflare the registration comes from the build:
 * `@sentry/cloudflare/vite` provides the `@flue/runtime` binding and the orchestrion registration
 * installs `flueIntegration()`. So any `gen_ai` span here is itself the proof that the auto-wiring
 * worked, and a manual-registration regression shows up as an empty trace, not a wrong attribute.
 */
test('instruments a Flue agent with no manual instrument() call', async () => {
  const conversationId = await runAgentTurn(workerUrl, newInstanceId('weather'), 'What is the weather in Paris?');

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the agent spans: sentry trace view ${traceTarget(traceId!)}`);

  let spans: TraceItem[] = [];
  await expect
    .poll(() => (spans = flattenTrace(fetchTrace(traceId!))).map(span => span.op), EVENT_POLLING_OPTIONS)
    .toEqual(expect.arrayContaining(['gen_ai.invoke_agent', 'gen_ai.chat', 'gen_ai.execute_tool']));

  const invokeAgent = spans.find(span => span.op === 'gen_ai.invoke_agent');
  const chat = spans.find(span => span.op === 'gen_ai.chat');
  const executeTool = spans.find(span => span.op === 'gen_ai.execute_tool');

  await expect
    .poll(() => fetchSpanAttributes(traceId!, invokeAgent!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      origin: 'auto.ai.flue',
      'gen_ai.agent.name': 'Hello',
    });

  await expect
    .poll(() => fetchSpanAttributes(traceId!, chat!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({
      origin: 'auto.ai.flue',
      'gen_ai.provider.name': 'openrouter',
      'gen_ai.usage.input_tokens': expect.anything(),
      'gen_ai.cost.total_tokens': expect.anything(),
    });

  await expect
    .poll(() => fetchSpanAttributes(traceId!, executeTool!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ 'gen_ai.tool.name': 'get_weather' });
  expect(chat?.parent_span_id).toBe(invokeAgent?.event_id);
  expect(executeTool?.parent_span_id).toBe(invokeAgent?.event_id);
});

test('nests a manual span raised inside a tool under that tool span', async () => {
  const conversationId = await runAgentTurn(workerUrl, newInstanceId('manual-span'), 'What is the weather in Berlin?');

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the manual span: sentry trace view ${traceTarget(traceId!)}`);

  let spans: TraceItem[] = [];
  await expect
    .poll(() => (spans = flattenTrace(fetchTrace(traceId!))).map(span => span.description), EVENT_POLLING_OPTIONS)
    .toEqual(expect.arrayContaining(['execute_tool get_weather', 'resolve-weather']));

  const executeTool = spans.find(span => span.op === 'gen_ai.execute_tool');
  const manualSpan = spans.find(span => span.description === 'resolve-weather');

  await expect
    .poll(() => fetchSpanAttributes(traceId!, manualSpan!.event_id!), EVENT_POLLING_OPTIONS)
    .toMatchObject({ 'weather.source': 'static-table' });
  expect(manualSpan?.parent_span_id).toBe(executeTool?.event_id);
});
