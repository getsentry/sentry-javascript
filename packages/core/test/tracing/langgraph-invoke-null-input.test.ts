import { describe, expect, it, vi } from 'vitest';
import { instrumentLangGraph } from '../../src/tracing/langgraph';

/**
 * Creates a minimal mock StateGraph that simulates LangGraph's StateGraph.
 * The compile() method returns a mock CompiledGraph with an invoke() method.
 */
function createMockStateGraph(invokeResult: unknown = { messages: [] }) {
  return {
    compile: (options?: Record<string, unknown>) => {
      return {
        invoke: vi.fn().mockResolvedValue(invokeResult),
        name: options?.name ?? 'test_graph',
        builder: {
          nodes: {},
        },
      };
    },
  };
}

describe('LangGraph invoke with null input (resume scenario)', () => {
  it('should not throw TypeError when invoke is called with null as first argument', async () => {
    const stateGraph = createMockStateGraph();
    instrumentLangGraph(stateGraph, { recordInputs: true, recordOutputs: true });

    const compiled = stateGraph.compile({ name: 'resume_agent' });

    // Simulates graph.invoke(null, config) which is the standard pattern
    // for resuming a LangGraph graph after a human-in-the-loop interrupt.
    // Previously this would throw: TypeError: Cannot read properties of null (reading 'messages')
    await expect(
      compiled.invoke(null, {
        configurable: { thread_id: 'thread-123' },
      }),
    ).resolves.not.toThrow();
  });

  it('should not throw TypeError when invoke is called with undefined as first argument', async () => {
    const stateGraph = createMockStateGraph();
    instrumentLangGraph(stateGraph, { recordInputs: true, recordOutputs: true });

    const compiled = stateGraph.compile({ name: 'resume_agent' });

    await expect(
      compiled.invoke(undefined, {
        configurable: { thread_id: 'thread-123' },
      }),
    ).resolves.not.toThrow();
  });

  it('should not throw when invoke is called with no arguments', async () => {
    const stateGraph = createMockStateGraph();
    instrumentLangGraph(stateGraph, { recordInputs: true, recordOutputs: true });

    const compiled = stateGraph.compile({ name: 'resume_agent' });

    await expect(compiled.invoke()).resolves.not.toThrow();
  });

  it('should still work correctly with a normal messages input', async () => {
    const mockResult = {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    };
    const stateGraph = createMockStateGraph(mockResult);
    instrumentLangGraph(stateGraph, { recordInputs: true, recordOutputs: true });

    const compiled = stateGraph.compile({ name: 'chat_agent' });

    const result = await compiled.invoke({ messages: [{ role: 'user', content: 'hello' }] });
    expect(result).toEqual(mockResult);
  });

  it('should still work correctly with an empty object input', async () => {
    const stateGraph = createMockStateGraph();
    instrumentLangGraph(stateGraph, { recordInputs: true, recordOutputs: true });

    const compiled = stateGraph.compile({ name: 'resume_agent' });

    await expect(compiled.invoke({}, { configurable: { thread_id: 'thread-456' } })).resolves.not.toThrow();
  });
});
