import { describe, expect, it } from 'vitest';
import {
  instrumentCreateReactAgent,
  instrumentLangGraph,
  instrumentStateGraph,
  instrumentStateGraphCompile,
} from '../../../src/tracing/langgraph';

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

  it('exposes instrumentLangGraph as a deprecated alias for instrumentStateGraph', () => {
    expect(instrumentLangGraph).toBe(instrumentStateGraph);
  });
});
