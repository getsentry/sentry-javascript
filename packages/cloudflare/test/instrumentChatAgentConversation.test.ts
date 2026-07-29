import { getCurrentScope } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentChatAgentConversation } from '../src/instrumentations/agents/instrumentChatAgentConversation';
import type { AgentInternals } from '../src/instrumentations/agents/types';

describe('instrumentChatAgentConversation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not set conversation id when agent name is empty string', () => {
    const setConversationIdSpy = vi.spyOn(getCurrentScope(), 'setConversationId').mockImplementation(() => {});

    const obj: AgentInternals = {
      name: '',
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj.onChatMessage!(() => {}, {});

    expect(setConversationIdSpy).not.toHaveBeenCalled();
  });

  it('does not set conversation id when agent name is undefined', () => {
    const setConversationIdSpy = vi.spyOn(getCurrentScope(), 'setConversationId').mockImplementation(() => {});

    const obj: AgentInternals = {
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj.onChatMessage!(() => {}, {});

    expect(setConversationIdSpy).not.toHaveBeenCalled();
  });

  it('sets conversation id when agent name is present', () => {
    const setConversationId = vi.fn();
    vi.spyOn(getCurrentScope(), 'setConversationId').mockImplementation(setConversationId);

    const obj: AgentInternals = {
      name: 'conversation-42',
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledWith('conversation-42');
  });

  it('forwards the return value from the original onChatMessage', () => {
    const obj: AgentInternals = {
      name: 'convo-1',
      onChatMessage() {
        return { output: 'hello' };
      },
    };

    instrumentChatAgentConversation(obj);

    const result = obj.onChatMessage!(() => {}, {});

    expect(result).toEqual({ output: 'hello' });
  });

  it('leaves the agent untouched when onChatMessage is not defined', () => {
    const obj: AgentInternals = { name: 'agent-1' };

    instrumentChatAgentConversation(obj);

    expect('onChatMessage' in obj).toBe(false);
  });

  it('uses the instance name as the conversation id before any clear', () => {
    const setConversationId = vi.fn();
    vi.spyOn(getCurrentScope(), 'setConversationId').mockImplementation(setConversationId);

    const obj: AgentInternals = {
      name: 'session-7',
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledWith('session-7');
  });

  it('rotates the conversation id on the message:clear observability event (fresh id, not the instance name)', () => {
    const setConversationId = vi.fn();
    vi.spyOn(getCurrentScope(), 'setConversationId').mockImplementation(setConversationId);

    const obj: AgentInternals = {
      name: 'session-7',
      _emit() {
        return undefined;
      },
      onChatMessage() {
        return 'response';
      },
    };

    instrumentChatAgentConversation(obj);

    // Simulate the SDK emitting the chat-clear observability event.
    obj._emit!('message:clear');

    obj.onChatMessage!(() => {}, {});

    expect(setConversationId).toHaveBeenCalledTimes(1);
    const rotated = setConversationId.mock.calls[0]?.[0] as string;
    expect(typeof rotated).toBe('string');
    expect(rotated).not.toBe('session-7');
    expect(obj.__sentryConversationId).toBe(rotated);
  });

  it('forwards message:clear to the original _emit', () => {
    const received: Array<{ type: string; payload: unknown }> = [];
    const obj: AgentInternals = {
      name: 'session-7',
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

  it('does not rotate the conversation id for other observability events', () => {
    const obj: AgentInternals = {
      name: 'session-7',
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

    expect(obj.__sentryConversationId).toBeUndefined();
  });
});
