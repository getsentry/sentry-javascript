import { describe, expect, it } from 'vitest';
import { extractAgentNameFromParams, extractLLMFromParams } from '../../../src/tracing/langgraph/utils';

describe('extractLLMFromParams', () => {
  it('returns null for empty or invalid args', () => {
    expect(extractLLMFromParams([])).toBe(null);
    expect(extractLLMFromParams([null])).toBe(null);
    expect(extractLLMFromParams([{}])).toBe(null);
    expect(extractLLMFromParams([{ llm: false }])).toBe(null);
    expect(extractLLMFromParams([{ llm: 123 }])).toBe(null);
    expect(extractLLMFromParams([{ llm: {} }])).toBe(null);
  });

  it('extracts llm object with modelName', () => {
    expect(extractLLMFromParams([{ llm: { modelName: 'gpt-4o-mini', lc_namespace: ['langchain'] } }])).toStrictEqual({
      modelName: 'gpt-4o-mini',
      lc_namespace: ['langchain'],
    });
  });
});

describe('extractAgentNameFromParams', () => {
  it('returns null for empty or invalid args', () => {
    expect(extractAgentNameFromParams([])).toBe(null);
    expect(extractAgentNameFromParams([null])).toBe(null);
    expect(extractAgentNameFromParams([{}])).toBe(null);
    expect(extractAgentNameFromParams([{ name: 123 }])).toBe(null);
  });

  it('extracts agent name from params', () => {
    expect(extractAgentNameFromParams([{ name: 'my_agent' }])).toBe('my_agent');
  });
});
