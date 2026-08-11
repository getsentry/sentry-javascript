import { GEN_AI_INPUT_MESSAGES, GEN_AI_RESPONSE_TEXT } from '@sentry/conventions/attributes';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  instrumentCreateReactAgent,
  instrumentStateGraph,
  instrumentStateGraphCompile,
} from '../../../../src/ai/langgraph';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

describe('langgraph double-patch guard', () => {
  it('instrumentStateGraphCompile returns the same wrapper when applied twice', () => {
    const original = (() => ({})) as unknown as Parameters<typeof instrumentStateGraphCompile>[0];
    const first = instrumentStateGraphCompile(original, {});
    const second = instrumentStateGraphCompile(first, {});
    expect(second).toBe(first);
  });

  it('instrumentCreateReactAgent returns the same wrapper when applied twice', () => {
    const original = (() => ({})) as unknown as Parameters<typeof instrumentCreateReactAgent>[0];
    const first = instrumentCreateReactAgent(original);
    const second = instrumentCreateReactAgent(first);
    expect(second).toBe(first);
  });
});

describe('instrumentStateGraph', () => {
  it('wraps the compile method of a StateGraph instance and returns the same instance', () => {
    const originalCompile = () => ({});
    const stateGraph = { compile: originalCompile };

    const result = instrumentStateGraph(stateGraph);

    expect(result).toBe(stateGraph);
    expect(stateGraph.compile).not.toBe(originalCompile);
  });
});

describe('invoke_agent input/output recording', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  // Regression test for a graph built on a custom state annotation (no `messages` key). The
  // instrumentation used to read `args[0].messages` only, so the whole state was dropped.
  it('records the full state for a graph that does not use MessagesAnnotation', async () => {
    const endedSpans = setupClient();

    const compiled = {
      invoke: async (input: Record<string, unknown>) => ({ ...input, expanded: 'expanded idea', validated: true }),
    };
    const stateGraph = { compile: () => compiled };

    instrumentStateGraph(stateGraph, { recordInputs: true, recordOutputs: true });
    const graph = stateGraph.compile();
    const result = await graph.invoke({ idea: 'test idea' });

    expect(result).toEqual({ idea: 'test idea', expanded: 'expanded idea', validated: true });
    expect(endedSpans).toHaveLength(1);

    const data = spanToJSON(endedSpans[0]!).data;

    const inputMessages = data[GEN_AI_INPUT_MESSAGES] as string | undefined;
    expect(inputMessages).toBeDefined();
    const parsedInput = JSON.parse(inputMessages!) as Array<{ role: string; content: string }>;
    expect(parsedInput).toHaveLength(1);
    expect(parsedInput[0]!.role).toBe('user');
    expect(JSON.parse(parsedInput[0]!.content)).toEqual({ idea: 'test idea' });

    const responseText = data[GEN_AI_RESPONSE_TEXT] as string | undefined;
    expect(responseText).toBeDefined();
    const parsedOutput = JSON.parse(responseText!) as Array<{ role: string; content: string }>;
    expect(parsedOutput[0]!.role).toBe('assistant');
    expect(JSON.parse(parsedOutput[0]!.content)).toEqual({
      idea: 'test idea',
      expanded: 'expanded idea',
      validated: true,
    });
  });

  it('still records chat messages for a MessagesAnnotation graph', async () => {
    const endedSpans = setupClient();

    const compiled = {
      invoke: async (input: { messages: Array<{ role: string; content: string }> }) => ({
        messages: [...input.messages, { role: 'assistant', content: 'The weather is sunny' }],
      }),
    };
    const stateGraph = { compile: () => compiled };

    instrumentStateGraph(stateGraph, { recordInputs: true, recordOutputs: true });
    const graph = stateGraph.compile();
    await graph.invoke({ messages: [{ role: 'user', content: 'What is the weather today?' }] });

    const data = spanToJSON(endedSpans[0]!).data;

    const inputMessages = data[GEN_AI_INPUT_MESSAGES] as string | undefined;
    expect(inputMessages).toBeDefined();
    expect(JSON.parse(inputMessages!)).toEqual([{ role: 'user', content: 'What is the weather today?' }]);

    const responseText = data[GEN_AI_RESPONSE_TEXT] as string | undefined;
    expect(responseText).toBeDefined();
    expect(responseText).toContain('The weather is sunny');
  });

  it('does not record input messages when invoked with null input', async () => {
    const endedSpans = setupClient();

    const compiled = {
      invoke: async (_input?: unknown) => ({ messages: [{ role: 'assistant', content: 'resumed' }] }),
    };
    const stateGraph = { compile: () => compiled };

    instrumentStateGraph(stateGraph, { recordInputs: true, recordOutputs: true });
    const graph = stateGraph.compile();
    await expect(graph.invoke(null)).resolves.toBeDefined();

    const data = spanToJSON(endedSpans[0]!).data;
    expect(data[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
  });
});
