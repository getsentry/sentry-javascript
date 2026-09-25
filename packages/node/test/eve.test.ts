import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { eveInstrumentation } from '../src/eve';

describe('eveInstrumentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exposes a setup and turn.started / step.attempt.started events', () => {
    const provider = eveInstrumentation();

    expect(typeof provider.setup).toBe('function');
    expect(Object.keys(provider.events).sort()).toEqual(['step.attempt.started', 'turn.started']);
  });

  test('sets the session id as the conversation id from turn.started (event.sessionId)', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveInstrumentation().events['turn.started']({ sessionId: 'sess_abc' });

    expect(setConversationId).toHaveBeenCalledWith('sess_abc');
  });

  test('sets it from step.attempt.started (event.scope.sessionId) too', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveInstrumentation().events['step.attempt.started']({ scope: { sessionId: 'sess_resumed' } });

    expect(setConversationId).toHaveBeenCalledWith('sess_resumed');
  });

  test('honors a custom getConversationId', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveInstrumentation({ getConversationId: context => `conv-${context.session.id}` }).events['turn.started']({
      sessionId: 'xyz',
    });

    expect(setConversationId).toHaveBeenCalledWith('conv-xyz');
  });
});
