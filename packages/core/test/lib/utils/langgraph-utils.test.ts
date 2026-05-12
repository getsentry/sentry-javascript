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

  it('extracts llm object with model when modelName is absent', () => {
    expect(
      extractLLMFromParams([{ llm: { model: 'claude-3-5-sonnet-20241022', lc_namespace: ['langchain'] } }]),
    ).toStrictEqual({
      model: 'claude-3-5-sonnet-20241022',
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

  /**
   * Minimal `CallbackManager` stand-in. Mirrors `@langchain/core`'s real
   * semantics: `addHandler(_, inherit)` pushes to both `handlers` and
   * `inheritableHandlers` when `inherit !== false`, and `copy()` returns
   * a fresh manager carrying the same handlers — so we don't accidentally
   * test against a degenerate shape that bypasses `addHandler`.
   */
  function makeFakeCallbackManager(existingHandlers: unknown[] = [], existingInheritableHandlers?: unknown[]) {
    const manager = {
      handlers: [...existingHandlers],
      inheritableHandlers: [...(existingInheritableHandlers ?? existingHandlers)],
      addHandler: vi.fn(function (this: any, handler: unknown, inherit?: boolean) {
        this.handlers.push(handler);
        if (inherit !== false) {
          this.inheritableHandlers.push(handler);
        }
      }),
      copy: vi.fn(function (this: any) {
        return makeFakeCallbackManager(this.handlers, this.inheritableHandlers);
      }),
    };
    return manager;
  }

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

  it('preserves inheritable handlers when callbacks is a CallbackManager', () => {
    // Reproduces the LangGraph `streamMode: ['messages']` setup: a
    // CallbackManager carrying a StreamMessagesHandler is passed via
    // options.callbacks. Wrapping it as `[manager, sentryHandler]` would
    // drop the manager's inheritable children — instead we register
    // Sentry on a copy and keep the existing handler chain intact.
    const streamMessagesHandler = {
      name: 'StreamMessagesHandler',
      lc_prefer_streaming: true,
    };
    const manager = makeFakeCallbackManager([streamMessagesHandler]);
    const result = mergeSentryCallback(manager, sentryHandler) as {
      handlers: unknown[];
    };
    expect(Array.isArray(result)).toBe(false);
    expect(result.handlers).toEqual([streamMessagesHandler, sentryHandler]);
  });

  it('copies the manager rather than mutating the caller-supplied one', () => {
    // If we mutated the original, repeated invocations would accumulate
    // Sentry handlers (and tracers from prior runs would leak across runs).
    const manager = makeFakeCallbackManager([]);
    mergeSentryCallback(manager, sentryHandler);
    expect(manager.copy).toHaveBeenCalledTimes(1);
    expect(manager.handlers).toEqual([]);
  });

  it('registers the sentry handler as inheritable so child managers see it', () => {
    // LangChain's CallbackManager.getChild creates child managers via
    // `setHandlers(this.inheritableHandlers)`. If we add ourselves without
    // `inherit=true`, nested LLM calls inside an agent never receive the
    // Sentry handler.
    const manager = makeFakeCallbackManager([]);
    const result = mergeSentryCallback(manager, sentryHandler) as {
      addHandler: ReturnType<typeof vi.fn>;
      handlers: unknown[];
      inheritableHandlers: unknown[];
    };
    expect(result.addHandler).toHaveBeenCalledWith(sentryHandler, true);
    expect(result.inheritableHandlers).toEqual([sentryHandler]);
  });

  it('does not double-register when the copied manager already contains the handler', () => {
    const manager = makeFakeCallbackManager([sentryHandler]);
    const result = mergeSentryCallback(manager, sentryHandler) as {
      handlers: unknown[];
      addHandler: ReturnType<typeof vi.fn>;
    };
    expect(result.handlers).toEqual([sentryHandler]);
    expect(result.addHandler).not.toHaveBeenCalled();
  });

  it('does not double-register when the handler lives only on inheritableHandlers', () => {
    // Defensive: a CallbackManager subclass or externally-constructed
    // instance might keep the Sentry handler on `inheritableHandlers`
    // without mirroring it onto `handlers`. We must still recognize it
    // as already-registered to avoid duplicate spans on nested calls.
    const manager = makeFakeCallbackManager([], [sentryHandler]);
    const result = mergeSentryCallback(manager, sentryHandler) as {
      addHandler: ReturnType<typeof vi.fn>;
      inheritableHandlers: unknown[];
    };
    expect(result.addHandler).not.toHaveBeenCalled();
    expect(result.inheritableHandlers).toEqual([sentryHandler]);
  });

  it('returns the value unchanged when it is neither an array nor a CallbackManager', () => {
    const opaque = { name: 'NotAManager' };
    expect(mergeSentryCallback(opaque, sentryHandler)).toBe(opaque);
  });
});
