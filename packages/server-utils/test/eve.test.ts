import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { eveConversationHook } from '../src/eve';

describe('eveConversationHook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('subscribes to turn.started and step.started', () => {
    const { events } = eveConversationHook();

    expect(Object.keys(events).sort()).toEqual(['step.started', 'turn.started']);
  });

  test('sets the session id as the conversation id on turn.started', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveConversationHook().events['turn.started'](undefined, { session: { id: 'sess_abc' } });

    expect(setConversationId).toHaveBeenCalledWith('sess_abc');
  });

  test('sets it on step.started too, so model calls after a parked-turn resume are covered', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveConversationHook().events['step.started'](undefined, { session: { id: 'sess_resumed' } });

    expect(setConversationId).toHaveBeenCalledWith('sess_resumed');
  });

  test('honors a custom getConversationId', () => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveConversationHook({ getConversationId: context => `conv-${context.session.id}` }).events['turn.started'](
      undefined,
      { session: { id: 'xyz' } },
    );

    expect(setConversationId).toHaveBeenCalledWith('conv-xyz');
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
  ])('unsets the conversation id when the resolver returns %s', (_label, returnValue) => {
    const setConversationId = vi.spyOn(SentryCore, 'setConversationId').mockImplementation(() => undefined);

    eveConversationHook({ getConversationId: () => returnValue }).events['turn.started'](undefined, {
      session: { id: 'xyz' },
    });

    expect(setConversationId).toHaveBeenCalledWith(returnValue);
  });
});
