import { GEN_AI_INPUT_MESSAGES, GEN_AI_OUTPUT_MESSAGES, SENTRY_OP } from '@sentry/conventions/attributes';
import type { Span } from '@sentry/core';
import { getCurrentScope, setAsyncContextStrategy, setCurrentClient, spanToJSON, withScope } from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../../../src/async-context';
import { markEveGenAiRecordingDefault } from '../../../src/integrations/vercel-ai/gen-ai-recording-mode';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  subscribeVercelAiTracingChannel,
  type VercelAiCallInfo,
  type VercelAiChannelMessage,
} from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import * as dc from '../../../src/utils/diagnosticsChannel';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type Decide = (call: VercelAiCallInfo) => boolean | undefined;

const MESSAGES = [{ role: 'user', content: 'Capital of France?' }];

describe('Vercel AI per-call recording options', () => {
  let endedSpans: Span[];
  let decideInputs: Decide;
  let decideOutputs: Decide;
  const channel = dc.tracingChannel<VercelAiChannelMessage>(AI_SDK_TELEMETRY_TRACING_CHANNEL);

  function useClient(): TestClient {
    const client = new TestClient(
      getDefaultTestClientOptions({ dsn: 'https://public@dsn.ingest.sentry.io/1337', tracesSampleRate: 1 }),
    );
    setCurrentClient(client);
    client.init();
    client.on('spanEnd', span => endedSpans.push(span));
    return client;
  }

  beforeAll(() => {
    setAsyncLocalStorageAsyncContextStrategy();
    // The channel stays subscribed for the whole file, so each test swaps the decision functions.
    subscribeVercelAiTracingChannel(dc.tracingChannel, {
      recordInputs: call => decideInputs(call),
      recordOutputs: call => decideOutputs(call),
    });
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    endedSpans = [];
    decideInputs = () => true;
    decideOutputs = () => true;
    useClient();
  });

  function generateText(event: Record<string, unknown> = {}): Promise<unknown> {
    return channel.tracePromise(
      async () => {
        await channel.tracePromise(
          async () => ({ content: [{ type: 'text', text: 'Paris.' }], finishReason: 'stop' }),
          { type: 'languageModelCall', event: { callId: 'call-1', messages: MESSAGES, ...event } },
        );
        return { text: 'Paris.' };
      },
      { type: 'generateText', event: { callId: 'call-1', messages: MESSAGES, ...event } },
    );
  }

  function recorded(span: Span): { op: unknown; inputs: boolean; outputs: boolean } {
    const { attributes } = spanToJSON(span);
    return {
      op: attributes[SENTRY_OP],
      inputs: GEN_AI_INPUT_MESSAGES in attributes,
      outputs: GEN_AI_OUTPUT_MESSAGES in attributes,
    };
  }

  it('calls the functions once per span with the channel event type and event', async () => {
    const inputCalls: VercelAiCallInfo[] = [];
    const outputCalls: VercelAiCallInfo[] = [];
    decideInputs = call => {
      inputCalls.push(call);
      return true;
    };
    decideOutputs = call => {
      outputCalls.push(call);
      return true;
    };

    await generateText({ functionId: 'chat' });

    const event = { callId: 'call-1', messages: MESSAGES, functionId: 'chat' };
    expect(inputCalls).toEqual([
      { type: 'generateText', event },
      { type: 'languageModelCall', event },
    ]);
    expect(outputCalls).toEqual(inputCalls);
  });

  it('decides for each span', async () => {
    decideInputs = call => call.type !== 'languageModelCall';
    decideOutputs = call => call.event.functionId === 'public';

    await generateText({ functionId: 'public' });
    await generateText({ functionId: 'private' });

    expect(endedSpans.map(recorded)).toEqual([
      { op: 'gen_ai.generate_content', inputs: false, outputs: true },
      { op: 'gen_ai.invoke_agent', inputs: true, outputs: true },
      { op: 'gen_ai.generate_content', inputs: false, outputs: false },
      { op: 'gen_ai.invoke_agent', inputs: true, outputs: false },
    ]);
  });

  it("runs the functions in the caller's async context", async () => {
    decideInputs = () => getCurrentScope().getScopeData().tags.privacy === 'public';
    decideOutputs = decideInputs;

    await withScope(async scope => {
      scope.setTag('privacy', 'public');
      await generateText();
    });
    await withScope(async scope => {
      scope.setTag('privacy', 'private');
      await generateText();
    });

    expect(endedSpans.map(recorded)).toEqual([
      { op: 'gen_ai.generate_content', inputs: true, outputs: true },
      { op: 'gen_ai.invoke_agent', inputs: true, outputs: true },
      { op: 'gen_ai.generate_content', inputs: false, outputs: false },
      { op: 'gen_ai.invoke_agent', inputs: false, outputs: false },
    ]);
  });

  it('decides inputs and outputs separately', async () => {
    decideInputs = () => false;
    decideOutputs = () => true;

    await generateText();

    expect(endedSpans.map(recorded)).toEqual([
      { op: 'gen_ai.generate_content', inputs: false, outputs: true },
      { op: 'gen_ai.invoke_agent', inputs: false, outputs: true },
    ]);
  });

  it('keeps the start-time decision for a streamed model call', async () => {
    let outputDecisions = 0;
    decideOutputs = () => {
      outputDecisions++;
      return true;
    };

    await channel.tracePromise(
      async () => {
        const result = await channel.tracePromise(
          async () => ({
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-delta', delta: 'Paris.' });
                controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 3 } });
                controller.close();
              },
            }),
          }),
          { type: 'languageModelCall', event: { callId: 'call-2', messages: MESSAGES } },
        );
        decideOutputs = () => false;
        const reader = (result as { stream: ReadableStream }).stream.getReader();
        while (!(await reader.read()).done) {
          // drain
        }
        return undefined;
      },
      { type: 'streamText', event: { callId: 'call-2', messages: MESSAGES } },
    );

    expect(outputDecisions).toBe(2);
    expect(endedSpans.map(recorded)).toEqual([
      { op: 'gen_ai.generate_content', inputs: true, outputs: true },
      { op: 'gen_ai.invoke_agent', inputs: true, outputs: true },
    ]);
  });

  describe('under eve', () => {
    beforeEach(() => {
      markEveGenAiRecordingDefault(useClient());
    });

    it("falls back to eve's default when a function returns undefined", async () => {
      decideInputs = () => undefined;
      decideOutputs = () => undefined;

      await generateText({ recordInputs: false, recordOutputs: false });

      expect(endedSpans.map(recorded)).toEqual([
        { op: 'gen_ai.generate_content', inputs: true, outputs: true },
        { op: 'gen_ai.invoke_agent', inputs: true, outputs: true },
      ]);
    });

    it('lets a function result outrank eve mode', async () => {
      decideInputs = () => false;
      decideOutputs = () => true;

      await generateText({ recordInputs: true, recordOutputs: false });

      expect(endedSpans.map(recorded)).toEqual([
        { op: 'gen_ai.generate_content', inputs: false, outputs: true },
        { op: 'gen_ai.invoke_agent', inputs: false, outputs: true },
      ]);
    });
  });

  it('honors the per-call flags when a function returns undefined', async () => {
    decideInputs = () => undefined;
    decideOutputs = () => undefined;

    await generateText({ recordInputs: false, recordOutputs: true });

    expect(endedSpans.map(recorded)).toEqual([
      { op: 'gen_ai.generate_content', inputs: false, outputs: true },
      { op: 'gen_ai.invoke_agent', inputs: false, outputs: true },
    ]);
  });
});
