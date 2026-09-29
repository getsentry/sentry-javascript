import { expect, test } from '@playwright/test';
import {
  EVENT_POLLING_OPTIONS,
  fetchTrace,
  findErrorInTrace,
  findTraceIdOfSpan,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';
import { runAgentTurn } from './utils';

// Flue runs the turn from a Durable Object alarm, and the SDK starts a new trace for every alarm. So the
// test cannot pick the trace id, and looks the trace up by the conversation id instead.

test('Sends the spans of a Flue agent turn to Sentry', async () => {
  const conversationId = await runAgentTurn('What is the weather in Paris?');

  console.log(`Polling for the agent span of conversation ${conversationId}`);

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the spans of the agent turn: sentry trace view ${traceTarget(traceId!)}`);

  await expect
    .poll(() => flattenTrace(fetchTrace(traceId!)).map(item => item.op), EVENT_POLLING_OPTIONS)
    .toEqual(expect.arrayContaining(['gen_ai.invoke_agent', 'gen_ai.chat', 'gen_ai.execute_tool']));
});

test('Sends an error thrown inside a Flue tool to Sentry', async () => {
  const conversationId = await runAgentTurn('Please call fail_now to trigger a failure.');

  console.log(`Polling for the agent span of conversation ${conversationId}`);

  let traceId: string | undefined;
  await expect
    .poll(() => (traceId = findTraceIdOfSpan(`gen_ai.conversation.id:${conversationId}`)), EVENT_POLLING_OPTIONS)
    .toBeDefined();

  console.log(`Polling for the tool error: sentry trace view ${traceTarget(traceId!)}`);

  await expect.poll(() => findErrorInTrace(traceId!), EVENT_POLLING_OPTIONS).toBeDefined();
});
