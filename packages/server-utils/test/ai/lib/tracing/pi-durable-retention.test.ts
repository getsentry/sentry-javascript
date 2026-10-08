import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaybeWeakRef, Span } from '@sentry/core';
import { derefWeakRef, getMainCarrier, makeWeakRef, setCurrentClient, spanToJSON } from '@sentry/core';
import { createRuns, startRun } from '../../../../src/ai/pi-durable/runs';
import { instrumentTool } from '../../../../src/ai/pi-durable/tools';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

// Own file on purpose: the other pi-durable tests keep every span that ends, which would keep the span
// this test needs to see collected.

function collectGarbage(): void {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  setFlagsFromString('--no-expose-gc');
  gc();
  gc();
}

describe('pi-durable memory retention', () => {
  let client: TestClient;

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('does not keep the span of a tool call alive for a conversation whose first run has not started', async () => {
    const runs = createRuns();
    let call: MaybeWeakRef<Span> | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;
    client.on('spanStart', span => {
      if (!call) {
        call = makeWeakRef(span);
        ({ traceId, spanId } = span.spanContext());
      }
    });
    const tool = instrumentTool(
      {
        name: 'delegate',
        execute: async (_args, api) => {
          await api.commit!(
            tx =>
              (tx as { createConversation: (...args: unknown[]) => unknown }).createConversation({
                ownership: { kind: 'task', taskId: 7 },
              }),
            undefined,
          );
          return { content: [{ type: 'text', text: 'Subagent created.' }] };
        },
      },
      runs,
      {},
    );

    await tool.execute(
      {},
      { taskId: 7, callId: 'call_1', commit: async change => change({ createConversation: async () => ({ id: 42 }) }) },
      undefined,
    );
    // A WeakRef is never cleared in the job that created it.
    await new Promise(resolve => setTimeout(resolve, 0));
    collectGarbage();

    expect(derefWeakRef(call)).toBeUndefined();
    const run = spanToJSON(startRun(42, runs).span);
    expect(run.trace_id).toBe(traceId);
    expect(run.parent_span_id).toBe(spanId);
  });
});
