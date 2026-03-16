import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  spanToJSON,
  startSpan,
} from '../../../src';
import { instrumentLangGraph } from '../../../src/tracing/langgraph';
import { getSpanDescendants } from '../../../src/utils/spanUtils';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('instrumentLangGraph sendDefaultPii resolution', () => {
  beforeEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  function setup(sendDefaultPii: boolean): void {
    const options = getDefaultTestClientOptions({ tracesSampleRate: 1, sendDefaultPii });
    const client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  }

  function createFakeStateGraph(invokeResult: unknown): { compile: (...args: unknown[]) => unknown } {
    return {
      compile(..._args: unknown[]) {
        return {
          invoke: async (..._invokeArgs: unknown[]) => invokeResult,
        };
      },
    };
  }

  it('defaults recordInputs and recordOutputs to false when sendDefaultPii is false', async () => {
    setup(false);

    const graph = createFakeStateGraph({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    });
    instrumentLangGraph(graph);

    await startSpan({ name: 'test-root' }, async rootSpan => {
      const compiled = graph.compile({ name: 'test_agent' });
      await compiled.invoke({ messages: [{ role: 'user', content: 'hello' }] });

      const descendants = getSpanDescendants(rootSpan);
      const invokeSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.invoke_agent');
      expect(invokeSpan).toBeDefined();

      const data = spanToJSON(invokeSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      expect(data?.['gen_ai.response.text']).toBeUndefined();
    });
  });

  it('respects sendDefaultPii: true', async () => {
    setup(true);

    const graph = createFakeStateGraph({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    });
    instrumentLangGraph(graph);

    await startSpan({ name: 'test-root' }, async rootSpan => {
      const compiled = graph.compile({ name: 'test_agent' });
      await compiled.invoke({ messages: [{ role: 'user', content: 'hello' }] });

      const descendants = getSpanDescendants(rootSpan);
      const invokeSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.invoke_agent');
      expect(invokeSpan).toBeDefined();

      const data = spanToJSON(invokeSpan!).data;
      expect(data?.['gen_ai.input.messages']).toBeDefined();
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });

  it('explicit options override sendDefaultPii', async () => {
    setup(true);

    const graph = createFakeStateGraph({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
    });
    instrumentLangGraph(graph, { recordInputs: false });

    await startSpan({ name: 'test-root' }, async rootSpan => {
      const compiled = graph.compile({ name: 'test_agent' });
      await compiled.invoke({ messages: [{ role: 'user', content: 'hello' }] });

      const descendants = getSpanDescendants(rootSpan);
      const invokeSpan = descendants.find(s => s !== rootSpan && spanToJSON(s).op === 'gen_ai.invoke_agent');
      expect(invokeSpan).toBeDefined();

      const data = spanToJSON(invokeSpan!).data;
      // recordInputs explicitly false → no input messages
      expect(data?.['gen_ai.input.messages']).toBeUndefined();
      // recordOutputs still true from sendDefaultPii → response text present
      expect(data?.['gen_ai.response.text']).toBeDefined();
    });
  });
});
