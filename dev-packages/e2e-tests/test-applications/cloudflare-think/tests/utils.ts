import { expect } from '@playwright/test';

export type StreamedSpan = {
  span_id?: string;
  parent_span_id?: string;
  trace_id?: string;
  name?: string;
  status?: string;
  attributes?: Record<string, { value?: unknown }>;
};

export const attr = (span: StreamedSpan | undefined, key: string): unknown => span?.attributes?.[key]?.value;

/**
 * An agent instance id nothing has used yet.
 *
 * The id is the `:name` path segment `routeAgentRequest` maps to a Durable Object, so reusing one
 * across tests would reuse its stored transcript and alarm state. A fresh id per turn keeps each
 * test to its own agent, and keeps `test:dev` from inheriting what `test:prod` left behind.
 */
export function newAgentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Whether a trace belongs to the turn `agentId` drove.
 *
 * Every test in this app drives the same agent class through the same two tools, so a predicate
 * written only in terms of span ops matches any test's trace. Playwright runs the files in parallel
 * against one worker and one event proxy, so that is not hypothetical: a test asserting on
 * `get_weather` will happily latch onto the trace of the one asserting on `fail_now`. The agent id
 * is in the request path, which is unique per turn, so scoping on it is what keeps each test to its
 * own trace.
 */
export function isTurnOf(agentId: string) {
  return (spansOfTrace: StreamedSpan[]): boolean =>
    spansOfTrace.some(span => String(attr(span, 'url.path') ?? '').endsWith(`/${agentId}`));
}

/**
 * Run one Think turn and wait for it to finish.
 *
 * The agent's `onRequest` drives `runTurn()` in its default `wait` mode, so unlike frameworks that
 * admit the work and return `202`, the response only arrives once the turn has settled. That makes
 * this a plain request: no polling needed.
 */
export async function runAgentTurn(baseURL: string, agentId: string, message: string): Promise<void> {
  const res = await fetch(`${baseURL}/agents/think-agent/${agentId}?message=${encodeURIComponent(message)}`, {
    method: 'POST',
  });

  expect(res.status).toBe(200);
  await res.text();
}
