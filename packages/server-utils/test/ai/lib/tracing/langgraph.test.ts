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

  async function getInvokeAttributes<T>(invoke: (input: T) => Promise<unknown>, input: T) {
    const endedSpans = setupClient();
    const stateGraph = { compile: () => ({ invoke }) };

    instrumentStateGraph(stateGraph, { recordInputs: true, recordOutputs: true });
    await stateGraph.compile().invoke(input);

    expect(endedSpans).toHaveLength(1);
    return spanToJSON(endedSpans[0]!).attributes;
  }

  it('records the full state for a graph that does not use MessagesAnnotation', async () => {
    const attributes = await getInvokeAttributes(
      async (input: Record<string, unknown>) => ({ ...input, expanded: 'expanded idea', validated: true }),
      { idea: 'test idea' },
    );

    expect(JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string)).toEqual([
      { role: 'user', content: JSON.stringify({ idea: 'test idea' }) },
    ]);
    expect(JSON.parse(attributes[GEN_AI_RESPONSE_TEXT] as string)).toEqual([
      {
        role: 'assistant',
        content: JSON.stringify({ idea: 'test idea', expanded: 'expanded idea', validated: true }),
      },
    ]);
  });

  it('still records chat messages for a MessagesAnnotation graph', async () => {
    const attributes = await getInvokeAttributes(
      async (input: { messages: Array<{ role: string; content: string }> }) => ({
        messages: [...input.messages, { role: 'assistant', content: 'The weather is sunny' }],
      }),
      { messages: [{ role: 'user', content: 'What is the weather today?' }] },
    );

    expect(JSON.parse(attributes[GEN_AI_INPUT_MESSAGES] as string)).toEqual([
      { role: 'user', content: 'What is the weather today?' },
    ]);
    expect(attributes[GEN_AI_RESPONSE_TEXT]).toContain('The weather is sunny');
  });

  it('records an empty messages array as an empty chat array', async () => {
    const attributes = await getInvokeAttributes(
      async (_input: { messages: unknown[] }) => ({ messages: [{ role: 'assistant', content: 'Hello' }] }),
      { messages: [] },
    );

    expect(attributes[GEN_AI_INPUT_MESSAGES]).toBe('[]');
    expect(attributes[GEN_AI_RESPONSE_TEXT]).toContain('Hello');
  });

  it('does not record input messages when invoked with null input', async () => {
    const attributes = await getInvokeAttributes(
      async (_input: null) => ({ messages: [{ role: 'assistant', content: 'resumed' }] }),
      null,
    );

    expect(attributes[GEN_AI_INPUT_MESSAGES]).toBeUndefined();
  });
});
