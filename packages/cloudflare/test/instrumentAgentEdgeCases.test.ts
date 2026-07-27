import * as SentryCore from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_CLASS_ATTRIBUTE,
  AGENT_FIBER_ID_ATTRIBUTE,
  AGENT_FIBER_NAME_ATTRIBUTE,
  AGENT_NAME_ATTRIBUTE,
  AGENT_SCHEDULE_ID_ATTRIBUTE,
} from '../src/instrumentations/agents/types';
import { instrumentAgentCallableRpc } from '../src/instrumentations/agents/instrumentAgentCallableRpc';
import { instrumentAgentFiber } from '../src/instrumentations/agents/instrumentAgentFiber';
import { instrumentAgentSchedule } from '../src/instrumentations/agents/instrumentAgentSchedule';
import { instrumentAgentStart } from '../src/instrumentations/agents/instrumentAgentStart';
import { instrumentChatAgentConversation } from '../src/instrumentations/agents/instrumentChatAgentConversation';
import type { AgentInternals } from '../src/instrumentations/agents/types';
import { getAgentAttributes } from '../src/instrumentations/agents/types';

describe('instrumentAgentCallableRpc', () => {
  let startSpanSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts callable method from an ArrayBuffer message', () => {
    // The codec path for ArrayBuffer messages (used by the agents SDK framework).
    const encoder = new TextEncoder();
    const message = encoder.encode(JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: ['World'] })).buffer;

    const emitted: unknown[] = [];
    const obj: AgentInternals = {
      onMessage(_connection: unknown, msg: unknown) {
        emitted.push(msg);
        return 'handled';
      },
    };

    // startSpan needs to call the callback so the original return value propagates.
    startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((_opts, callback) => callback());

    instrumentAgentCallableRpc(obj);

    expect(obj.onMessage!({}, message)).toBe('handled');
    expect(emitted).toHaveLength(1);
    expect(startSpanSpy).toHaveBeenCalled();
  });

  it('passes through raw binary that is not valid UTF-8', () => {
    const emitted: unknown[] = [];
    const obj: AgentInternals = {
      onMessage(_connection: unknown, msg: unknown) {
        emitted.push(msg);
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    // A single byte 0xFF is not valid UTF-8 → TextDecoder returns empty, passthrough.
    const buffer = new Uint8Array([0xff]).buffer;
    expect(obj.onMessage!({}, buffer)).toBe('handled');
    expect(emitted).toHaveLength(1);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('passes through non-RPC JSON messages without a span', () => {
    const emitted: unknown[] = [];
    const obj: AgentInternals = {
      onMessage(_connection: unknown, msg: unknown) {
        emitted.push(msg);
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    // Internal `cf_agent_state` messages are JSON but not RPC type.
    obj.onMessage!({}, JSON.stringify({ type: 'cf_agent_state', state: {} }));
    expect(emitted).toHaveLength(1);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('passes through JSON with missing method field', () => {
    const obj: AgentInternals = {
      onMessage() {
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    obj.onMessage!({}, JSON.stringify({ type: 'rpc', id: '1' }));
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('passes through JSON with non-string method field', () => {
    const obj: AgentInternals = {
      onMessage() {
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    obj.onMessage!({}, JSON.stringify({ type: 'rpc', method: 42, args: [] }));
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('passes through when args is not an array', () => {
    const obj: AgentInternals = {
      onMessage() {
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    obj.onMessage!({}, JSON.stringify({ type: 'rpc', method: 'greet', args: 'not-an-array' }));
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('gracefully handles onMessage not being a function', () => {
    const obj: AgentInternals = {};

    expect(() => instrumentAgentCallableRpc(obj)).not.toThrow();
  });

  it('passes through non-string values that are not ArrayBuffer', () => {
    const obj: AgentInternals = {
      onMessage() {
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    // `undefined` second arg → `extractCallableMethod` returns undefined → passthrough.
    obj.onMessage!({}, undefined);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('passes through ArrayBuffer with non-JSON content', () => {
    const obj: AgentInternals = {
      onMessage() {
        return 'handled';
      },
    };

    instrumentAgentCallableRpc(obj);

    const buffer = new TextEncoder().encode('not-json-arraybuffer').buffer;
    obj.onMessage!({}, buffer);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });
});

describe('instrumentAgentSchedule', () => {
  let startSpanSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((_opts, callback) => callback());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not create a span when called with null', () => {
    const executed: unknown[] = [];
    const obj: AgentInternals = {
      _executeScheduleCallback(row: unknown) {
        executed.push(row);
        return 'done';
      },
    };

    instrumentAgentSchedule(obj);

    expect(obj._executeScheduleCallback!(null)).toBe('done');
    expect(executed).toHaveLength(1);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('does not create a span when called with undefined', () => {
    const executed: unknown[] = [];
    const obj: AgentInternals = {
      _executeScheduleCallback(row: unknown) {
        executed.push(row);
        return 'done';
      },
    };

    instrumentAgentSchedule(obj);

    expect(obj._executeScheduleCallback!(undefined)).toBe('done');
    expect(executed).toHaveLength(1);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('creates a span without schedule id when row has callback but no id', () => {
    const obj: AgentInternals = {
      _executeScheduleCallback() {
        return 'done';
      },
    };

    instrumentAgentSchedule(obj);

    obj._executeScheduleCallback!({ callback: 'myTask' });

    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'myTask',
        attributes: expect.not.objectContaining({
          [AGENT_SCHEDULE_ID_ATTRIBUTE]: expect.any(String),
        }),
      }),
      expect.any(Function),
    );
  });

  it('does not create a span when callback name is an empty string', () => {
    const obj: AgentInternals = {
      _executeScheduleCallback() {
        return 'done';
      },
    };

    instrumentAgentSchedule(obj);

    obj._executeScheduleCallback!({ callback: '' });

    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('forwards the return value from the original callback', () => {
    const obj: AgentInternals = {
      _executeScheduleCallback() {
        return { scheduled: true };
      },
    };

    instrumentAgentSchedule(obj);

    const result = obj._executeScheduleCallback!({ callback: 'myTask', id: 'sched-1' });

    expect(result).toEqual({ scheduled: true });
  });

  it('gracefully handles _executeScheduleCallback not being a function', () => {
    const obj: AgentInternals = {};

    expect(() => instrumentAgentSchedule(obj)).not.toThrow();
  });
});

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
});

describe('instrumentAgentStart', () => {
  let startSpanSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((_opts, callback) => callback());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps onStart in an agent_start span and forwards the return value', () => {
    const obj: AgentInternals = {
      _ParentClass: { name: 'MyAgent' },
      name: 'instance-1',
      onStart() {
        return 'started';
      },
    };

    instrumentAgentStart(obj);

    expect(obj.onStart!()).toBe('started');
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent_start',
        attributes: expect.objectContaining({
          [AGENT_CLASS_ATTRIBUTE]: 'MyAgent',
          [AGENT_NAME_ATTRIBUTE]: 'instance-1',
        }),
      }),
      expect.any(Function),
    );
  });

  it('forwards arguments to the original onStart', () => {
    const received: unknown[] = [];
    const obj: AgentInternals = {
      onStart(...args: unknown[]) {
        received.push(...args);
        return 'ok';
      },
    };

    instrumentAgentStart(obj);

    obj.onStart!('a', 'b');
    expect(received).toEqual(['a', 'b']);
  });

  it('gracefully handles onStart not being a function', () => {
    const obj: AgentInternals = {};

    expect(() => instrumentAgentStart(obj)).not.toThrow();
    expect(startSpanSpy).not.toHaveBeenCalled();
  });
});

describe('instrumentAgentFiber', () => {
  let startSpanSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((_opts, callback) => callback());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the span after the fiber and records id and name attributes', () => {
    const obj: AgentInternals = {
      _runFiberInternal() {
        return 'ran';
      },
    };

    instrumentAgentFiber(obj);

    expect(obj._runFiberInternal!('fiber-1', 'refreshTokens')).toBe('ran');
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'refreshTokens',
        attributes: expect.objectContaining({
          [AGENT_FIBER_ID_ATTRIBUTE]: 'fiber-1',
          [AGENT_FIBER_NAME_ATTRIBUTE]: 'refreshTokens',
        }),
      }),
      expect.any(Function),
    );
  });

  it('falls back to a generic span name when name is empty', () => {
    const obj: AgentInternals = {
      _runFiberInternal() {
        return 'ran';
      },
    };

    instrumentAgentFiber(obj);

    obj._runFiberInternal!('fiber-1', '');
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fiber',
        attributes: expect.not.objectContaining({
          [AGENT_FIBER_NAME_ATTRIBUTE]: expect.any(String),
        }),
      }),
      expect.any(Function),
    );
  });

  it('omits the id attribute when id is not a string', () => {
    const obj: AgentInternals = {
      _runFiberInternal() {
        return 'ran';
      },
    };

    instrumentAgentFiber(obj);

    obj._runFiberInternal!(undefined as unknown as string, 'work');
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.not.objectContaining({
          [AGENT_FIBER_ID_ATTRIBUTE]: expect.any(String),
        }),
      }),
      expect.any(Function),
    );
  });

  it('forwards id, name and remaining arguments to the original', () => {
    const received: unknown[] = [];
    const obj: AgentInternals = {
      _runFiberInternal(...args: unknown[]) {
        received.push(...args);
        return 'ran';
      },
    };

    instrumentAgentFiber(obj);

    obj._runFiberInternal!('fiber-1', 'work', 'extra');
    expect(received).toEqual(['fiber-1', 'work', 'extra']);
  });

  it('gracefully handles _runFiberInternal not being a function', () => {
    const obj: AgentInternals = {};

    expect(() => instrumentAgentFiber(obj)).not.toThrow();
    expect(startSpanSpy).not.toHaveBeenCalled();
  });
});

describe('getAgentAttributes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips class attribute when _ParentClass.name is empty', () => {
    const result = getAgentAttributes({ _ParentClass: { name: '' }, name: 'agent-1' });

    expect(result).toEqual({ [AGENT_NAME_ATTRIBUTE]: 'agent-1' });
  });

  it('skips name attribute when instance name is empty', () => {
    const result = getAgentAttributes({ _ParentClass: { name: 'MyAgent' }, name: '' });

    expect(result).toEqual({ [AGENT_CLASS_ATTRIBUTE]: 'MyAgent' });
  });

  it('skips both attributes when _ParentClass is missing and name is absent', () => {
    const result = getAgentAttributes({});

    expect(result).toEqual({});
  });

  it('skips both attributes when _ParentClass.name is undefined and name is absent', () => {
    const result = getAgentAttributes({ _ParentClass: {} });

    expect(result).toEqual({});
  });

  it('returns both attributes when class and name are present', () => {
    const result = getAgentAttributes({ _ParentClass: { name: 'MyAgent' }, name: 'instance-1' });

    expect(result).toEqual({
      [AGENT_CLASS_ATTRIBUTE]: 'MyAgent',
      [AGENT_NAME_ATTRIBUTE]: 'instance-1',
    });
  });
});
