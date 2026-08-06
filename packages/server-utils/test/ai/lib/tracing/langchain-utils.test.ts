import { describe, expect, it, vi } from 'vitest';
import type { LangChainMessage } from '../../../../src/ai/langchain/types';
import {
  _INTERNAL_mergeLangChainCallbackHandler,
  normalizeLangChainMessages,
} from '../../../../src/ai/langchain/utils';

describe('normalizeLangChainMessages', () => {
  it('normalizes messages with _getType()', () => {
    const messages = [
      {
        _getType: () => 'human',
        content: 'Hello',
      },
      {
        _getType: () => 'ai',
        content: 'Hi there!',
      },
    ] as unknown as LangChainMessage[];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
  });

  it('normalizes messages with type property', () => {
    const messages: LangChainMessage[] = [
      { type: 'human', content: 'Hello' },
      { type: 'ai', content: 'Hi!' },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('normalizes messages with role property', () => {
    const messages: LangChainMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('normalizes serialized LangChain format', () => {
    const messages: LangChainMessage[] = [
      {
        lc: 1,
        id: ['langchain_core', 'messages', 'HumanMessage'],
        kwargs: { content: 'Hello from serialized' },
      },
    ];

    const result = normalizeLangChainMessages(messages);
    expect(result).toEqual([{ role: 'user', content: 'Hello from serialized' }]);
  });
});

describe('_INTERNAL_mergeLangChainCallbackHandler', () => {
  const sentryHandler = { name: 'SentryCallbackHandler' };

  function makeFakeCallbackManager(existingHandlers: unknown[] = []) {
    const manager = {
      handlers: [...existingHandlers],
      inheritableHandlers: [...existingHandlers],
      addHandler: vi.fn(function (this: any, handler: unknown, inherit?: boolean) {
        this.handlers.push(handler);
        if (inherit !== false) {
          this.inheritableHandlers.push(handler);
        }
      }),
      copy: vi.fn(function (this: any) {
        return makeFakeCallbackManager(this.handlers);
      }),
    };
    return manager;
  }

  it('returns a fresh array when no existing callbacks are present', () => {
    expect(_INTERNAL_mergeLangChainCallbackHandler(undefined, sentryHandler)).toStrictEqual([sentryHandler]);
    expect(_INTERNAL_mergeLangChainCallbackHandler(null, sentryHandler)).toStrictEqual([sentryHandler]);
  });

  it('appends to an existing callbacks array', () => {
    const userA = { _user: 'A' };
    const userB = { _user: 'B' };
    expect(_INTERNAL_mergeLangChainCallbackHandler([userA, userB], sentryHandler)).toStrictEqual([
      userA,
      userB,
      sentryHandler,
    ]);
  });

  it('does not duplicate when the sentry handler is already in the array', () => {
    const userA = { _user: 'A' };
    const existing = [userA, sentryHandler];
    expect(_INTERNAL_mergeLangChainCallbackHandler(existing, sentryHandler)).toBe(existing);
  });

  it('preserves inheritable handlers when callbacks is a CallbackManager', () => {
    // Reproduces the LangGraph `streamMode: ['messages']` setup: a
    // CallbackManager carrying a StreamMessagesHandler is passed via
    // options.callbacks. Wrapping it as `[manager, sentryHandler]` would
    // drop the manager's inheritable children — instead we register
    // Sentry on a copy and keep the existing handler chain intact.
    const streamMessagesHandler = { name: 'StreamMessagesHandler', lc_prefer_streaming: true };
    const manager = makeFakeCallbackManager([streamMessagesHandler]);
    const result = _INTERNAL_mergeLangChainCallbackHandler(manager, sentryHandler) as { handlers: unknown[] };
    expect(Array.isArray(result)).toBe(false);
    expect(result.handlers).toEqual([streamMessagesHandler, sentryHandler]);
  });

  it('copies the manager and registers Sentry as an inheritable handler', () => {
    const manager = makeFakeCallbackManager([]);
    const result = _INTERNAL_mergeLangChainCallbackHandler(manager, sentryHandler) as {
      addHandler: ReturnType<typeof vi.fn>;
      inheritableHandlers: unknown[];
    };
    expect(manager.copy).toHaveBeenCalledTimes(1);
    expect(manager.handlers).toEqual([]);
    expect(result.addHandler).toHaveBeenCalledWith(sentryHandler, true);
    expect(result.inheritableHandlers).toEqual([sentryHandler]);
  });

  it('returns the manager unchanged without copying when it already contains the handler', () => {
    const manager = makeFakeCallbackManager([sentryHandler]);
    const result = _INTERNAL_mergeLangChainCallbackHandler(manager, sentryHandler);
    expect(result).toBe(manager);
    expect(manager.copy).not.toHaveBeenCalled();
    expect(manager.addHandler).not.toHaveBeenCalled();
  });

  it('wraps a lone callback object into an array with the sentry handler', () => {
    const opaque = { name: 'NotAManager' };
    expect(_INTERNAL_mergeLangChainCallbackHandler(opaque, sentryHandler)).toStrictEqual([opaque, sentryHandler]);
  });

  it('returns unchanged when the lone callback object is already a sentry handler', () => {
    const existing = { name: 'SentryCallbackHandler' };
    expect(_INTERNAL_mergeLangChainCallbackHandler(existing, sentryHandler)).toBe(existing);
  });
});
