import { describe, expect, it } from 'vitest';
import { instrumentCreateReactAgent, instrumentStateGraphCompile } from '../../../src/tracing/langgraph';

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
