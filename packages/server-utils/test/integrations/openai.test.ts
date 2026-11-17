import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import {
  getCurrentScope,
  GLOBAL_OBJ,
  setAsyncContextStrategy,
  setCurrentClient,
  spanToJSON,
  withScope,
} from '@sentry/core';
import { GEN_AI_INPUT_MESSAGES, GEN_AI_RESPONSE_TEXT } from '@sentry/conventions/attributes';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import type { OpenAiCallInfo } from '../../src/ai/openai/types';
import { groqIntegration } from '../../src/integrations/groq';
import { openAIIntegration } from '../../src/integrations/openai';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

type Decide = (call: OpenAiCallInfo) => boolean | undefined;

const RESPONSE = {
  id: 'chatcmpl-1',
  model: 'gpt-4o',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Paris.' }, finish_reason: 'stop' }],
};

describe('per-call recording options', () => {
  let endedSpans: Span[];
  let decideInputs: Decide;
  let decideOutputs: Decide;

  function useClient(genAI?: { inputs?: boolean; outputs?: boolean }): void {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        ...(genAI ? { dataCollection: { genAI } } : {}),
      }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  }

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['openai', 'groq-sdk'] };
    endedSpans = [];
    useClient();
    // The channels stay subscribed for the whole file, so each test swaps the decision functions.
    const options = {
      recordInputs: (call: OpenAiCallInfo) => decideInputs(call),
      recordOutputs: (call: OpenAiCallInfo) => decideOutputs(call),
    };
    for (const integration of [openAIIntegration(options), groqIntegration(options)]) {
      integration.setup!(getCurrentScope().getClient()!);
    }
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    endedSpans = [];
    decideInputs = () => true;
    decideOutputs = () => true;
    useClient();
  });

  function chat(channel: string, params: Record<string, unknown>): Promise<unknown> {
    return tracingChannel(channel).tracePromise(async () => RESPONSE, { arguments: [params] });
  }

  function recorded(span: Span): { inputs: boolean; outputs: boolean } {
    const { attributes } = spanToJSON(span);
    return { inputs: GEN_AI_INPUT_MESSAGES in attributes, outputs: GEN_AI_RESPONSE_TEXT in attributes };
  }

  const params = (metadata: Record<string, string>): Record<string, unknown> => ({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Capital of France?' }],
    metadata,
  });

  it.each([
    ['openAIIntegration', CHANNELS.OPENAI_CHAT],
    ['groqIntegration', CHANNELS.GROQ_CHAT],
  ])('%s decides for each call from its request', async (_name, channel) => {
    const calls: OpenAiCallInfo[] = [];
    decideInputs = call => {
      calls.push(call);
      return (call.request?.metadata as Record<string, string>).privacy === 'public';
    };
    decideOutputs = decideInputs;

    const publicParams = params({ privacy: 'public' });
    await chat(channel, publicParams);
    await chat(channel, params({ privacy: 'private' }));

    expect(calls[0]).toEqual({ operation: 'chat', request: publicParams });
    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it("runs the functions in the caller's async context", async () => {
    decideInputs = () => getCurrentScope().getScopeData().tags.privacy === 'public';
    decideOutputs = decideInputs;

    await withScope(async scope => {
      scope.setTag('privacy', 'public');
      await chat(CHANNELS.OPENAI_CHAT, params({}));
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      await chat(CHANNELS.OPENAI_CHAT, params({}));
    });

    expect(endedSpans.map(recorded)).toEqual([
      { inputs: true, outputs: true },
      { inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', async () => {
    decideInputs = () => false;
    decideOutputs = () => true;

    await chat(CHANNELS.OPENAI_CHAT, params({}));

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('falls back to dataCollection.genAI when a function returns undefined', async () => {
    useClient({ inputs: false, outputs: true });
    decideInputs = () => undefined;
    decideOutputs = () => undefined;

    await chat(CHANNELS.OPENAI_CHAT, params({}));

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
  });

  it('records no content when a function throws, and the call still succeeds', async () => {
    decideInputs = () => {
      throw new Error('boom');
    };
    decideOutputs = decideInputs;

    await expect(chat(CHANNELS.OPENAI_CHAT, params({}))).resolves.toBe(RESPONSE);

    expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: false }]);
  });
});
