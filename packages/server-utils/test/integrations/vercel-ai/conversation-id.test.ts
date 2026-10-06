import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GEN_AI_CONVERSATION_ID, GEN_AI_RESPONSE_ID } from '@sentry/conventions/attributes';
import {
  conversationIdIntegration,
  getMainCarrier,
  setConversationId,
  setCurrentClient,
  spanToStaticSpanJSON,
  withActiveSpan,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import { getProviderMetadataAttributes } from '../../../src/ai/vercel-ai';
import {
  clearOperationCallId,
  createSpanFromMessage,
  enrichSpanOnEnd,
} from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

type Message = Parameters<typeof createSpanFromMessage>[0];
const channelOptions = {} as Parameters<typeof createSpanFromMessage>[1];

describe('Vercel AI SDK conversation id', () => {
  let endedSpans: Span[];

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
    // The bare test client has no default integrations; the Node SDK registers this one itself.
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
        integrations: [conversationIdIntegration()],
      }),
    );
    setCurrentClient(client);
    client.init();
    endedSpans = [];
    client.on('spanEnd', span => endedSpans.push(span));
  });

  afterEach(() => {
    setConversationId(undefined);
    clearOperationCallId('call-1');
    getMainCarrier().__SENTRY__ = undefined;
  });

  function run(message: Message): Record<string, unknown> {
    const span = createSpanFromMessage(message, channelOptions)!;
    enrichSpanOnEnd(span, message, {} as Parameters<typeof enrichSpanOnEnd>[2]);
    span.end();
    return spanToStaticSpanJSON(endedSpans[endedSpans.length - 1]!).data ?? {};
  }

  it('reads the OpenAI Conversations API id from the operation `providerOptions`', () => {
    const data = run({
      type: 'generateText',
      event: { callId: 'call-1', providerOptions: { openai: { conversation: 'conv_abc' } } },
    });
    expect(data[GEN_AI_CONVERSATION_ID]).toBe('conv_abc');
  });

  it('reads the id from the `azure` provider options', () => {
    const data = run({
      type: 'generateText',
      event: { callId: 'call-1', providerOptions: { azure: { conversation: 'conv_azure' } } },
    });
    expect(data[GEN_AI_CONVERSATION_ID]).toBe('conv_azure');
  });

  it('reads the `azure` id when the `openai` options have no conversation', () => {
    const data = run({
      type: 'generateText',
      event: {
        callId: 'call-1',
        providerOptions: { openai: { reasoningEffort: 'low' }, azure: { conversation: 'conv_azure' } },
      },
    });
    expect(data[GEN_AI_CONVERSATION_ID]).toBe('conv_azure');
  });

  it('passes the operation id on to the model-call and tool spans that start under it', () => {
    const operationMessage: Message = {
      type: 'generateText',
      event: { callId: 'call-1', providerOptions: { openai: { conversation: 'conv_abc' } } },
    };
    const operationSpan = createSpanFromMessage(operationMessage, channelOptions)!;
    // Child events start while the operation span is the active span (the channel binds it as context).
    const [modelCall, toolCall] = withActiveSpan(operationSpan, () => [
      run({ type: 'languageModelCall', event: { callId: 'call-1', modelId: 'gpt-4' } }),
      run({
        type: 'executeTool',
        event: { callId: 'call-1', toolCall: { toolName: 'echo', toolCallId: 'tc-1', input: {} } },
      }),
    ]);
    operationSpan.end();

    expect(spanToStaticSpanJSON(operationSpan).data?.[GEN_AI_CONVERSATION_ID]).toBe('conv_abc');
    expect(modelCall![GEN_AI_CONVERSATION_ID]).toBe('conv_abc');
    expect(toolCall![GEN_AI_CONVERSATION_ID]).toBe('conv_abc');
  });

  it('does not pass an outer conversation id to a nested operation', () => {
    const outer = createSpanFromMessage(
      {
        type: 'generateText',
        event: { callId: 'call-outer', providerOptions: { openai: { conversation: 'conv_abc' } } },
      },
      channelOptions,
    )!;
    // e.g. a sub-agent `generateText` called from inside a tool's `execute`
    const inner = withActiveSpan(outer, () =>
      run({
        type: 'generateText',
        event: { callId: 'call-1', providerOptions: { openai: { previousResponseId: 'resp_1' } } },
      }),
    );
    outer.end();
    clearOperationCallId('call-outer');

    expect(inner[GEN_AI_CONVERSATION_ID]).toBeUndefined();
  });

  it('sets nothing for `previousResponseId` chaining, which names a response rather than a thread', () => {
    const data = run({
      type: 'generateText',
      event: { callId: 'call-1', providerOptions: { openai: { previousResponseId: 'resp_1' } } },
    });
    expect(data[GEN_AI_CONVERSATION_ID]).toBeUndefined();
  });

  it('does not record the provider `responseId` as the conversation id', () => {
    const data = run({
      type: 'languageModelCall',
      event: { callId: 'call-1', modelId: 'gpt-4' },
      result: { response: { id: 'resp_1' }, providerMetadata: { openai: { responseId: 'resp_1' } } },
    });
    expect(data[GEN_AI_RESPONSE_ID]).toBe('resp_1');
    expect(data[GEN_AI_CONVERSATION_ID]).toBeUndefined();
    expect(getProviderMetadataAttributes({ openai: { responseId: 'resp_1' } })).toEqual({});
  });

  it('lets an id set via `Sentry.setConversationId()` win over the provider option', () => {
    setConversationId('conv-from-scope');
    const data = run({
      type: 'generateText',
      event: { callId: 'call-1', providerOptions: { openai: { conversation: 'conv_abc' } } },
    });
    expect(data[GEN_AI_CONVERSATION_ID]).toBe('conv-from-scope');
  });
});
