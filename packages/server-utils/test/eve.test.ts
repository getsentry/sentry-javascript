import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eveConversationHook, eveIntegration, eveTracePolicy } from '../src/eve';
import { isEveGenAiRecordingDefault } from '../src/integrations/vercel-ai/gen-ai-recording-mode';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

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

describe('eveIntegration', () => {
  test('is named Eve', () => {
    expect(eveIntegration().name).toBe('Eve');
  });

  test('marks the client so the Vercel AI subscriber records gen_ai content by default', () => {
    const client = {} as SentryCore.Client;

    expect(isEveGenAiRecordingDefault(client)).toBe(false);

    eveIntegration().setup?.(client);

    expect(isEveGenAiRecordingDefault(client)).toBe(true);
  });
});

describe('eveTracePolicy', () => {
  beforeEach(() => {
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    SentryCore.getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(options: Partial<SentryCore.ClientOptions>): void {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', ...options }),
    );
    SentryCore.setCurrentClient(client);
    client.init();
  }

  test('asks for full results even when dataCollection.genAI turns content off, since Sentry filters spans itself', () => {
    setupClient({ dataCollection: { genAI: { inputs: false, outputs: false } } });

    expect(eveTracePolicy()).toEqual({ emit: true, recordInputs: true, recordOutputs: true });
  });

  test('allows no content without a client', () => {
    expect(eveTracePolicy()).toEqual({ emit: true, recordInputs: false, recordOutputs: false });
  });
});
