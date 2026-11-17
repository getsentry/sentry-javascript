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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../src/async-context';
import { anthropicAIIntegration } from '../../src/integrations/anthropic';
import { googleGenAIIntegration } from '../../src/integrations/google-genai';
import { mistralAIIntegration } from '../../src/integrations/mistral';
import { CHANNELS } from '../../src/orchestrion/channels';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

type CallInfo = { operation: string; request?: Record<string, unknown> };
type Decide = (call: CallInfo) => boolean | undefined;

const MESSAGES = [{ role: 'user', content: 'Capital of France?' }];

const PROVIDERS = [
  {
    name: 'anthropicAIIntegration',
    channel: CHANNELS.ANTHROPIC_CHAT,
    operation: 'chat',
    params: (metadata: Record<string, string>) => ({ model: 'claude-sonnet-4-5', messages: MESSAGES, metadata }),
    response: { id: 'msg_1', model: 'claude-sonnet-4-5', content: [{ type: 'text', text: 'Paris.' }] },
  },
  {
    name: 'googleGenAIIntegration',
    channel: CHANNELS.GOOGLE_GENAI_GENERATE_CONTENT,
    operation: 'generate_content',
    params: (labels: Record<string, string>) => ({
      model: 'gemini-2.5-flash',
      contents: 'Capital of France?',
      config: { labels },
    }),
    response: { candidates: [{ content: { role: 'model', parts: [{ text: 'Paris.' }] } }] },
  },
  {
    name: 'mistralAIIntegration',
    channel: CHANNELS.MISTRAL_CHAT,
    operation: 'chat',
    params: (metadata: Record<string, string>) => ({ model: 'mistral-large-latest', messages: MESSAGES, metadata }),
    response: {
      id: 'cmpl_1',
      model: 'mistral-large-latest',
      choices: [{ message: { role: 'assistant', content: 'Paris.' }, finishReason: 'stop' }],
    },
  },
];

describe('per-call recording options', () => {
  let endedSpans: Span[];
  let decideInputs: Decide;
  let decideOutputs: Decide;

  function useClient(): void {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
  }

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    vi.stubEnv('ANTHROPIC_OPEN_TELEMETRY', undefined);
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@anthropic-ai/sdk', '@google/genai', '@mistralai/mistralai'] };
    endedSpans = [];
    useClient();
    // The channels stay subscribed for the whole file, so each test swaps the decision functions.
    const options = {
      recordInputs: (call: CallInfo) => decideInputs(call),
      recordOutputs: (call: CallInfo) => decideOutputs(call),
    };
    for (const integration of [
      anthropicAIIntegration(options),
      googleGenAIIntegration(options),
      mistralAIIntegration(options),
    ]) {
      integration.setup!(getCurrentScope().getClient()!);
    }
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    endedSpans = [];
    decideInputs = () => true;
    decideOutputs = () => true;
    useClient();
  });

  function call(channel: string, params: Record<string, unknown>, response: unknown): Promise<unknown> {
    return tracingChannel(channel).tracePromise(async () => response, { arguments: [params] });
  }

  function recorded(span: Span): { inputs: boolean; outputs: boolean } {
    const { attributes } = spanToJSON(span);
    return { inputs: GEN_AI_INPUT_MESSAGES in attributes, outputs: GEN_AI_RESPONSE_TEXT in attributes };
  }

  describe.each(PROVIDERS)('$name', ({ channel, operation, params, response }) => {
    it('decides for each call from its request', async () => {
      const calls: CallInfo[] = [];
      decideInputs = info => {
        calls.push(info);
        return JSON.stringify(info.request).includes('"public"');
      };
      decideOutputs = decideInputs;

      const publicParams = params({ privacy: 'public' });
      await call(channel, publicParams, response);
      await call(channel, params({ privacy: 'private' }), response);

      expect(calls[0]).toEqual({ operation, request: publicParams });
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
        await call(channel, params({}), response);
      });
      await withScope(async scope => {
        scope.setTag('privacy', 'private');
        await call(channel, params({}), response);
      });

      expect(endedSpans.map(recorded)).toEqual([
        { inputs: true, outputs: true },
        { inputs: false, outputs: false },
      ]);
    });

    it('decides inputs and outputs separately', async () => {
      decideInputs = () => false;
      decideOutputs = () => true;

      await call(channel, params({}), response);

      expect(endedSpans.map(recorded)).toEqual([{ inputs: false, outputs: true }]);
    });
  });
});
