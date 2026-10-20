import { expect } from '@playwright/test';
import { SEARCH_GEN_AI__CONVERSATION__ID } from '@sentry/conventions/attributes/search';
import type { TraceItem } from '@sentry-internal/test-utils/cli';
import {
  EVENT_POLLING_OPTIONS,
  fetchTrace,
  findTraceIdOfSpan,
  flattenTrace,
  traceTarget,
} from '@sentry-internal/test-utils/cli';

/** An agent instance id nothing has used yet, so a settled record cannot end the wait early. */
export function newInstanceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run one agent turn over Flue's agent router and wait for it to settle. Returns the id of the
 * conversation, which the SDK sets as `gen_ai.conversation.id` on the agent span.
 *
 * `POST /:id` only admits the work (it returns `202` and the turn runs after), so this reads the
 * conversation back until it reports a settlement.
 */
export async function runAgentTurn(baseURL: string, instanceId: string, message: string): Promise<string> {
  const url = `${baseURL}/agents/hello/${instanceId}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'user', body: message }),
  });
  const body = await res.text();
  expect(res.status, body).toBe(202);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const conversation = (await (await fetch(url)).json()) as { conversationId: string; settlements?: unknown[] };
    if (conversation.settlements?.length) {
      return conversation.conversationId;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  throw new Error(`Flue turn for "${instanceId}" did not settle within 90s`);
}

/**
 * Find the trace of a conversation in Sentry and poll it until `isComplete` holds. The router answers
 * the `POST` before the turn runs, so the response carries no trace id to look up; the conversation id
 * is the handle the test has.
 */
export async function waitForConversationTrace(
  conversationId: string,
  isComplete: (spans: TraceItem[]) => boolean,
): Promise<{ traceId: string; spans: TraceItem[] }> {
  let traceId: string | undefined;
  await expect
    .poll(
      () => (traceId = findTraceIdOfSpan(`${SEARCH_GEN_AI__CONVERSATION__ID}:${conversationId}`)),
      EVENT_POLLING_OPTIONS,
    )
    .toBeDefined();

  console.log(`Polling for the agent spans: sentry trace view ${traceTarget(traceId!)}`);

  let spans: TraceItem[] = [];
  await expect.poll(() => isComplete((spans = flattenTrace(fetchTrace(traceId!)))), EVENT_POLLING_OPTIONS).toBe(true);

  return { traceId: traceId!, spans };
}
