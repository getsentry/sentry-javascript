import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { getIsolationScope } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentChatAgentConversation } from '../src/instrumentations/agents/instrumentChatAgentConversation';
import {
  AGENT_CONVERSATION_ID_STORAGE_KEY,
  type AgentInternals,
  setAgentConversationId,
} from '../src/instrumentations/agents/types';

/** `uuid4()` from `@sentry/core` returns 32 hex characters, without dashes. */
const UUID_PATTERN = /^[0-9a-f]{32}$/;

function mockStorage(stored?: string): {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  /** The currently persisted value, for asserting against an id the SDK minted itself. */
  peek: () => string | undefined;
} {
  let value = stored;
  return {
    get: vi.fn(async () => value),
    put: vi.fn(async (_key: string, newValue: string) => {
      value = newValue;
    }),
    peek: () => value,
  };
}

function mockCtx(stored?: string): {
  ctx: NonNullable<AgentInternals['ctx']>;
  storage: ReturnType<typeof mockStorage>;
} {
  const storage = mockStorage(stored);
  const ctx = {
    originalStorage: storage as unknown as DurableObjectStorage,
  } as unknown as NonNullable<AgentInternals['ctx']>;

  return { ctx, storage };
}

/**
 * The conversation id is written to the isolation scope — the scope the public
 * `Sentry.setConversationId()` targets — so that an explicit user call can override it.
 */
function spyOnSetConversationId(): ReturnType<typeof vi.fn> {
  const setConversationId = vi.fn();
  vi.spyOn(getIsolationScope(), 'setConversationId').mockImplementation(setConversationId);
  return setConversationId;
}

describe('instrumentChatAgentConversation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getIsolationScope().clear();
  });

  it('sets a generated conversation id during a chat turn', async () => {
    const setConversationId = spyOnSetConversationId();

    const obj: AgentInternals = {
      name: 'conversation-42',
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledTimes(1);
    expect(setConversationId).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
  });

  it('keeps the same conversation id across chat turns, reading storage only once', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx, storage } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});
    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledTimes(2);
    expect(setConversationId).toHaveBeenNthCalledWith(2, 'persisted-id');
    expect(storage.get).toHaveBeenCalledTimes(1);
  });

  it('mints a single conversation id when two units of work start concurrently', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx, storage } = mockCtx(undefined);
    const obj: AgentInternals = {
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await Promise.all([obj.onChatMessage!(() => {}, {}), obj.onChatMessage!(() => {}, {})]);

    // The second turn must adopt the id the first one minted instead of persisting a competing one.
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(setConversationId).toHaveBeenCalledTimes(2);
    expect(new Set(setConversationId.mock.calls.flat()).size).toBe(1);
  });

  it('leaves a conversation id the user set before the turn alone', async () => {
    const { ctx, storage } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    getIsolationScope().setConversationId('user-chosen-id');
    await obj.onChatMessage!(() => {}, {});

    expect(getIsolationScope().getScopeData().conversationId).toBe('user-chosen-id');
    // An explicit id means the instance's own id is never needed, so storage is not touched either.
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('replaces its own id from an earlier turn, so a rotation still takes effect', async () => {
    const { ctx } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    // The isolation scope outlives a unit of work, so the second turn finds the first turn's id
    // already there — ours, and therefore replaceable, unlike a user's.
    await obj.onChatMessage!(() => {}, {});
    expect(getIsolationScope().getScopeData().conversationId).toBe('persisted-id');

    obj._emit!('message:clear');
    await obj.onChatMessage!(() => {}, {});

    expect(getIsolationScope().getScopeData().conversationId).toMatch(UUID_PATTERN);
  });

  it('forwards the return value from the original onChatMessage', async () => {
    const obj: AgentInternals = {
      onChatMessage() {
        return { output: 'hello' };
      },
    };

    instrumentChatAgentConversation(obj);

    await expect(obj.onChatMessage!(() => {}, {})).resolves.toEqual({ output: 'hello' });
  });

  it('leaves the agent untouched when onChatMessage is not defined', () => {
    const obj: AgentInternals = { name: 'agent-1' };

    instrumentChatAgentConversation(obj);

    expect('onChatMessage' in obj).toBe(false);
  });

  it('rotates the conversation id on the message:clear observability event', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});

    // Simulate the SDK emitting the chat-clear observability event.
    obj._emit!('message:clear');

    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenNthCalledWith(1, 'persisted-id');
    expect(setConversationId).toHaveBeenNthCalledWith(2, expect.stringMatching(UUID_PATTERN));
  });

  it('forwards message:clear to the original _emit', () => {
    const received: Array<{ type: string; payload: unknown }> = [];
    const obj: AgentInternals = {
      _emit(type: string, payload?: Record<string, unknown>) {
        received.push({ type, payload });
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj._emit!('message:clear', { source: 'user' });
    expect(received).toEqual([{ type: 'message:clear', payload: { source: 'user' } }]);
  });

  it('does not rotate the conversation id for other observability events', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx, storage } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj._emit!('message:request');
    obj._emit!('rpc', { method: 'greet' });

    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledWith('persisted-id');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('persists the rotated conversation id to DO storage on message:clear', () => {
    const { ctx, storage } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj._emit!('message:clear');

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledWith(AGENT_CONVERSATION_ID_STORAGE_KEY, expect.stringMatching(UUID_PATTERN));
    expect(storage.peek()).not.toBe('persisted-id');
  });

  it('reads a persisted conversation id from DO storage (survives hibernation)', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx, storage } = mockCtx('persisted-id');
    const obj: AgentInternals = {
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledWith('persisted-id');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('resolves the id for an instance that was never routed through a handler wrapper', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx } = mockCtx('late-id');
    const obj: AgentInternals = { ctx };

    await setAgentConversationId(obj);

    expect(setConversationId).toHaveBeenCalledWith('late-id');
  });

  it('generates and persists a conversation id when storage has none', async () => {
    const setConversationId = spyOnSetConversationId();

    const { ctx, storage } = mockCtx(undefined);
    const obj: AgentInternals = {
      name: 'session-7',
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledWith(AGENT_CONVERSATION_ID_STORAGE_KEY, expect.stringMatching(UUID_PATTERN));
    expect(setConversationId).toHaveBeenCalledWith(storage.peek());
  });

  it('generates a conversation id when the instance has no DO storage at all', async () => {
    const setConversationId = spyOnSetConversationId();

    const obj: AgentInternals = {
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});
    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledTimes(2);
    expect(setConversationId).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
    expect(new Set(setConversationId.mock.calls.flat()).size).toBe(1);
  });

  it('prefers the uninstrumented originalStorage over the instrumented storage', async () => {
    const original = mockStorage();
    const instrumented = mockStorage();
    const ctx = {
      originalStorage: original as unknown as DurableObjectStorage,
      storage: instrumented as unknown as DurableObjectStorage,
    } as unknown as NonNullable<AgentInternals['ctx']>;

    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await obj.onChatMessage!(() => {}, {});
    obj._emit!('message:clear');

    expect(original.get).toHaveBeenCalled();
    expect(original.put).toHaveBeenCalled();
    expect(instrumented.get).not.toHaveBeenCalled();
    expect(instrumented.put).not.toHaveBeenCalled();
  });

  it('falls back to the instrumented storage when originalStorage is not exposed', () => {
    const storage = mockStorage();
    const ctx = {
      storage: storage as unknown as DurableObjectStorage,
    } as unknown as NonNullable<AgentInternals['ctx']>;

    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj._emit!('message:clear');

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(storage.put).toHaveBeenCalledWith(AGENT_CONVERSATION_ID_STORAGE_KEY, expect.stringMatching(UUID_PATTERN));
  });

  it('swallows storage read errors and keeps an in-memory id without overwriting storage', async () => {
    const setConversationId = spyOnSetConversationId();

    const storage = {
      get: vi.fn(async () => {
        throw new Error('storage unavailable');
      }),
      put: vi.fn(async () => undefined),
    };
    const ctx = {
      originalStorage: storage as unknown as DurableObjectStorage,
    } as unknown as NonNullable<AgentInternals['ctx']>;

    const obj: AgentInternals = {
      name: 'session-7',
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await expect(obj.onChatMessage!(() => {}, {})).resolves.toBe('response');

    expect(setConversationId).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
    // A read that failed may still have an id behind it — don't destroy it.
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('swallows a storage write that throws synchronously', async () => {
    const setConversationId = spyOnSetConversationId();

    const storage = {
      get: vi.fn(async () => undefined),
      put: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    };
    const ctx = {
      originalStorage: storage as unknown as DurableObjectStorage,
    } as unknown as NonNullable<AgentInternals['ctx']>;

    const obj: AgentInternals = {
      ctx,
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    await expect(obj.onChatMessage!(() => {}, {})).resolves.toBe('response');

    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(setConversationId).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
  });

  it('swallows storage write errors and keeps the rotation for the current wake', async () => {
    const setConversationId = spyOnSetConversationId();

    const storage = {
      get: vi.fn(async () => 'persisted-id'),
      put: vi.fn(async () => {
        throw new Error('storage unavailable');
      }),
    };
    const ctx = {
      originalStorage: storage as unknown as DurableObjectStorage,
    } as unknown as NonNullable<AgentInternals['ctx']>;

    const obj: AgentInternals = {
      ctx,
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    expect(() => obj._emit!('message:clear')).not.toThrow();

    await obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledWith(expect.stringMatching(UUID_PATTERN));
    expect(setConversationId).not.toHaveBeenCalledWith('persisted-id');
  });
});
