import { randomBytes } from 'node:crypto';
import { fetchFromWorker } from '@sentry-internal/test-utils/cloudflare';

/**
 * Runs one turn of the `Hello` agent in a new agent instance, waits for it to settle, and returns
 * the id of the conversation, which the SDK sets as `gen_ai.conversation.id` on the agent span.
 *
 * `POST /:id` only admits the work (it answers `202` and the turn runs after), so this reads the
 * conversation back until it reports a settlement.
 */
export async function runAgentTurn(message: string): Promise<string> {
  const url = `${process.env.E2E_TEST_WORKER_URL}/agents/hello/${randomBytes(8).toString('hex')}`;

  await fetchFromWorker(url, 202, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'user', body: message }),
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const conversation: { conversationId: string; settlements?: unknown[] } = JSON.parse(
      await fetchFromWorker(url, 200),
    );
    if (conversation.settlements?.length) {
      return conversation.conversationId;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  throw new Error(`The agent turn at ${url} did not settle within 90s.`);
}
