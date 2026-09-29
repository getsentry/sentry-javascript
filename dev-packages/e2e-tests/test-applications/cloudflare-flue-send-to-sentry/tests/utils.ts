import { fetchFromWorker } from '@sentry-internal/test-utils/cloudflare';

/** An agent instance id nothing has used yet, so a settled record cannot end the wait early. */
export function newInstanceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run one agent turn and wait for it to settle. Returns the id of the conversation, which the SDK
 * sets as `gen_ai.conversation.id` on the agent span. Flue runs the turn from a Durable Object alarm,
 * and the SDK starts a new trace for every alarm, so the tests find the trace by this id.
 *
 * `POST /:id` only admits the work (it returns `202` and the turn runs after), so this reads the
 * conversation back until it reports a settlement.
 */
export async function runAgentTurn(workerUrl: string, instanceId: string, message: string): Promise<string> {
  const url = `${workerUrl}/agents/hello/${instanceId}`;
  const authorization = `Bearer ${process.env.E2E_TEST_WORKER_TOKEN}`;

  await fetchFromWorker(url, 202, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify({ kind: 'user', body: message }),
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const conversation = JSON.parse(await fetchFromWorker(url, 200, { headers: { Authorization: authorization } })) as {
      conversationId: string;
      settlements?: unknown[];
    };
    if (conversation.settlements?.length) {
      return conversation.conversationId;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }

  throw new Error(`Flue turn for "${instanceId}" did not settle within 90s`);
}
