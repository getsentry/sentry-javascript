import { expect } from '@playwright/test';

/** A conversation id nothing has used yet, so a settled record cannot end the wait early. */
export function newConversationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run one agent turn and wait for it to settle.
 *
 * `POST /:id` only admits the work — it returns `202` and the turn runs after — so this reads the
 * conversation back until it reports a settlement.
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
