import { expect } from '@playwright/test';

export async function createConversation(baseURL: string): Promise<number> {
  const res = await fetch(`${baseURL}/conversations`, { method: 'POST' });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: number }).id;
}

/**
 * Send a message and wait until pi-durable settles it.
 *
 * The server only admits the input; the run continues in the background, and in the crash test in a
 * second server process. Polling the submission until it settles keeps each test to its own run, and
 * failed requests while the server restarts are retried.
 */
export async function sendMessage(
  baseURL: string,
  conversationId: number,
  content: string,
): Promise<{ status: string; reason?: string; detail?: string }> {
  const res = await fetch(`${baseURL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  expect(res.status).toBe(200);
  const { submissionId } = (await res.json()) as { submissionId: number };

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const submission = (await (await fetch(`${baseURL}/submissions/${submissionId}`)).json()) as {
        status: string;
        reason?: string;
        detail?: string;
      };
      if (submission.status === 'done' || submission.status === 'unanswered') {
        return submission;
      }
    } catch {
      // The server is restarting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Submission ${submissionId} did not settle within 90s`);
}
