import { describe, expect, it, vi } from 'vitest';
import {
  extractAgentNameFromParams,
  extractLLMFromParams,
  mergeSentryCallback,
} from '../../../src/tracing/langgraph/utils';

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

describe('mergeSentryCallback', () => {
  const sentryHandler = { _sentry: true };

  it('returns a fresh array when no existing callbacks are present', () => {
    expect(mergeSentryCallback(undefined, sentryHandler)).toStrictEqual([sentryHandler]);
    expect(mergeSentryCallback(null, sentryHandler)).toStrictEqual([sentryHandler]);
  });

  it('appends to an existing callbacks array', () => {
    const userA = { _user: 'A' };
    const userB = { _user: 'B' };
    expect(mergeSentryCallback([userA, userB], sentryHandler)).toStrictEqual([userA, userB, sentryHandler]);
  });

  it('does not duplicate when the sentry handler is already in the array', () => {
    const userA = { _user: 'A' };
    const existing = [userA, sentryHandler];
    expect(mergeSentryCallback(existing, sentryHandler)).toBe(existing);
  });

  it('calls addHandler on a CallbackManager-like object', () => {
    const addHandler = vi.fn();
    const manager = { addHandler, handlers: [] as unknown[] };
    const result = mergeSentryCallback(manager, sentryHandler);
    expect(result).toBe(manager);
    expect(addHandler).toHaveBeenCalledWith(sentryHandler);
    expect(addHandler).toHaveBeenCalledTimes(1);
  });

  it('does not re-add when the manager already has the sentry handler', () => {
    const addHandler = vi.fn();
    const manager = { addHandler, handlers: [sentryHandler] };
    mergeSentryCallback(manager, sentryHandler);
    expect(addHandler).not.toHaveBeenCalled();
  });
});
