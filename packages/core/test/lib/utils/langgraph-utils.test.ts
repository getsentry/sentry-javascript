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
    // Use a class so `Object.getPrototypeOf(instance).constructor.name === 'CallbackManager'`,
    // which is how the production detector identifies a real LangChain CallbackManager.
    class CallbackManager {
      public handlers: unknown[];
      public inheritableHandlers: unknown[];
      public addHandler = vi.fn((handler: unknown, inherit?: boolean) => {
        this.handlers.push(handler);
        if (inherit !== false) {
          this.inheritableHandlers.push(handler);
        }
      });
      public copy = vi.fn(() => makeFakeCallbackManager(this.handlers, this.inheritableHandlers));
      constructor(initialHandlers: unknown[], initialInheritableHandlers: unknown[]) {
        this.handlers = [...initialHandlers];
        this.inheritableHandlers = [...initialInheritableHandlers];
      }
    }
    return new CallbackManager(existingHandlers, existingInheritableHandlers ?? existingHandlers);
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

  it('copies the manager and registers Sentry as an inheritable handler', () => {
    // Two adjacent contracts: we operate on a copy (so repeat invocations
    // don't accumulate handlers on the caller), and we pass `inherit=true`
    // so LangChain's `getChild()` propagates Sentry into nested calls.
    const manager = makeFakeCallbackManager([]);
    const result = mergeSentryCallback(manager, sentryHandler) as {
      addHandler: ReturnType<typeof vi.fn>;
      inheritableHandlers: unknown[];
    };
    expect(manager.copy).toHaveBeenCalledTimes(1);
    expect(manager.handlers).toEqual([]);
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

  it('returns the value unchanged when it is neither an array nor a CallbackManager', () => {
    const opaque = { name: 'NotAManager' };
    expect(mergeSentryCallback(opaque, sentryHandler)).toBe(opaque);
  });

  it('does not treat a coincidentally duck-typed object as a CallbackManager', () => {
    // A plain object that happens to expose `addHandler`/`copy` shouldn't be
    // mistaken for a real LangChain CallbackManager — the constructor-name
    // check guards against false positives.
    const lookalike = { addHandler: vi.fn(), copy: vi.fn(), handlers: [] };
    expect(mergeSentryCallback(lookalike, sentryHandler)).toBe(lookalike);
    expect(lookalike.addHandler).not.toHaveBeenCalled();
    expect(lookalike.copy).not.toHaveBeenCalled();
  });

  it('recognizes subclasses of CallbackManager via the prototype walk', () => {
    class CallbackManager {
      public handlers: unknown[] = [];
      public inheritableHandlers: unknown[] = [];
      public addHandler = vi.fn((handler: unknown, inherit?: boolean) => {
        this.handlers.push(handler);
        if (inherit !== false) {
          this.inheritableHandlers.push(handler);
        }
      });
      public copy = vi.fn(() => new CallbackManager());
    }
    class CustomCallbackManager extends CallbackManager {}
    const subclass = new CustomCallbackManager();
    const result = mergeSentryCallback(subclass, sentryHandler) as {
      addHandler: ReturnType<typeof vi.fn>;
    };
    expect(result.addHandler).toHaveBeenCalledWith(sentryHandler, true);
  });
});
