import { describe, expect, test, vi } from 'vitest';
import { _INTERNAL_augmentCallbackHandlers } from '../../../src/integrations/tracing/langchain/instrumentation';

const sentryHandler = { name: 'SentryCallbackHandler' };

/**
 * Minimal `CallbackManager` stand-in. We only need the duck-typed shape
 * (`addHandler` + `copy`) for the production code to recognize this as a
 * `CallbackManager` rather than fall through to the "unknown" branch.
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

describe('augmentCallbackHandlers', () => {
  test('wraps Sentry handler in an array when no callbacks are configured', () => {
    const result = _INTERNAL_augmentCallbackHandlers(undefined, sentryHandler);
    expect(result).toEqual([sentryHandler]);
  });

  test('appends Sentry handler when callbacks is already an array', () => {
    const other = { name: 'OtherHandler' };
    const result = _INTERNAL_augmentCallbackHandlers([other], sentryHandler);
    expect(result).toEqual([other, sentryHandler]);
  });

  test('is idempotent when Sentry handler is already in the array', () => {
    const result = _INTERNAL_augmentCallbackHandlers([sentryHandler], sentryHandler);
    expect(result).toEqual([sentryHandler]);
  });

  test('preserves inheritable handlers when callbacks is a CallbackManager', () => {
    // Reproduces the LangGraph `streamMode: ['messages']` setup: a
    // CallbackManager carrying a StreamMessagesHandler is passed via
    // options.callbacks. Without this fix, the manager would be wrapped as
    // `[manager, sentryHandler]`, dropping all its inheritable children.
    const streamMessagesHandler = {
      name: 'StreamMessagesHandler',
      lc_prefer_streaming: true,
    };
    const manager = makeFakeCallbackManager([streamMessagesHandler]);

    const result = _INTERNAL_augmentCallbackHandlers(manager, sentryHandler) as {
      handlers: unknown[];
    };

    // The result is a manager (object), not a wrapping array.
    expect(Array.isArray(result)).toBe(false);
    // The original child handler is still there alongside Sentry's.
    expect(result.handlers).toEqual([streamMessagesHandler, sentryHandler]);
  });

  test('copies the manager rather than mutating the caller-supplied one', () => {
    // If we mutated the original manager, repeated invocations would
    // accumulate Sentry handlers (and tracers from prior runs would leak
    // into subsequent unrelated runs).
    const manager = makeFakeCallbackManager([]);
    _INTERNAL_augmentCallbackHandlers(manager, sentryHandler);
    expect(manager.copy).toHaveBeenCalledTimes(1);
    expect(manager.handlers).toEqual([]);
  });

  test('does not double-register Sentry handler when copy already contains it', () => {
    const manager = makeFakeCallbackManager([sentryHandler]);
    const result = _INTERNAL_augmentCallbackHandlers(manager, sentryHandler) as {
      handlers: unknown[];
      addHandler: ReturnType<typeof vi.fn>;
    };
    expect(result.handlers).toEqual([sentryHandler]);
    expect(result.addHandler).not.toHaveBeenCalled();
  });

  test('does not double-register when the handler lives only on inheritableHandlers', () => {
    // Defensive: a CallbackManager subclass or externally-constructed
    // instance might keep the Sentry handler on `inheritableHandlers`
    // without mirroring it onto `handlers`. We must still recognize it
    // as already-registered to avoid duplicate spans on nested calls.
    const manager = makeFakeCallbackManager([], [sentryHandler]);
    const result = _INTERNAL_augmentCallbackHandlers(manager, sentryHandler) as {
      handlers: unknown[];
      inheritableHandlers: unknown[];
      addHandler: ReturnType<typeof vi.fn>;
    };
    expect(result.addHandler).not.toHaveBeenCalled();
    expect(result.inheritableHandlers).toEqual([sentryHandler]);
  });

  test('returns the value unchanged when it is neither an array nor a CallbackManager', () => {
    const opaque = { name: 'NotAManager' };
    const result = _INTERNAL_augmentCallbackHandlers(opaque, sentryHandler);
    expect(result).toBe(opaque);
  });
});
