import { expect } from '@playwright/test';

/**
 * A conversation id nothing has used yet.
 *
 * `runAgentTurn` waits for the conversation to report a settlement, so a fixed id that already has
 * one — a Playwright retry, or the `test:dev` run hitting the record `test:prod` left behind —
 * would return before the new turn finished.
 */
export function newConversationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run one agent turn over Flue's agent router and wait for it to settle.
 *
 * `POST /:id` only admits the work — it returns `202` with a `streamUrl` and the turn runs after.
 * Returning there would let one test's turn still be emitting spans while the next one waits for
 * spans of its own, so a leftover trace could satisfy the wrong assertion. Reading the conversation
 * back until it reports a settlement keeps each test to its own turn.
 *
 * The conversation id is ours to choose: it is the `:id` path segment. It is not the
 * `gen_ai.conversation.id` attribute, which Flue generates.
 */
export async function runAgentTurn(baseURL: string, conversationId: string, message: string): Promise<void> {
  const url = `${baseURL}/agents/hello/${conversationId}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'user', body: message }),
  });
  expect(res.status).toBe(202);
  await res.text();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const conversation = (await (await fetch(url)).json()) as { settlements?: unknown[] };
    if (conversation.settlements?.length) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Flue turn for "${conversationId}" did not settle within 60s`);
}
