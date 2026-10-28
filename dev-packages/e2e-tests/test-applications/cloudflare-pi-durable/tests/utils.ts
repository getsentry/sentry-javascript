import { expect } from '@playwright/test';

export type Operation = { status: string; reason?: string; text?: string };

/**
 * A Durable Object name nothing has used yet. The name is the `:name` path segment
 * `routeAgentRequest` maps to an object, so each test gets its own SQLite database and pi Harness.
 */
export function newAgentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Submit a prompt to the root session. The response arrives once pi settles it. */
export function submitPrompt(
  baseURL: string,
  agentId: string,
  message: string,
  operationId?: string,
): Promise<Response> {
  return fetch(`${baseURL}/agents/assistant/${agentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, operationId }),
  });
}

export async function prompt(baseURL: string, agentId: string, message: string): Promise<Operation> {
  const res = await submitPrompt(baseURL, agentId, message);
  expect(res.status).toBe(200);
  return (await res.json()) as Operation;
}

/** Wait until pi settles an operation. The request starts the object again if it was reset. */
export async function waitForOperation(baseURL: string, agentId: string, operationId: string): Promise<Operation> {
  const res = await fetch(`${baseURL}/agents/assistant/${agentId}?operation=${operationId}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Operation;
}
