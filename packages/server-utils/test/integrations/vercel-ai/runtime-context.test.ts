import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON } from '@sentry/core';
import type { Span } from '@sentry/core';
import {
  clearOperationId,
  createSpanFromMessage,
  type VercelAiChannelMessage,
} from '../../../src/integrations/vercel-ai/vercel-ai-dc-subscriber';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

describe('Vercel AI runtime and tool context', () => {
  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  function setupClient(): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate: 1,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  function spanData(message: VercelAiChannelMessage, endedSpans: Span[]): Record<string, unknown> {
    createSpanFromMessage(message, {})?.end();
    return spanToStaticSpanJSON(endedSpans.at(-1)!).data;
  }

  it('records runtimeContext keys as strings on the operation span', () => {
    const endedSpans = setupClient();
    const data = spanData(
      {
        type: 'generateText',
        event: {
          aiVersion: '7.0.154',
          callId: 'call-1',
          runtimeContext: {
            requestId: 'req_1',
            attempt: 2,
            cached: false,
            user: { id: 'u1' },
            tags: ['a', 'b'],
            empty: null,
            missing: undefined,
          },
        },
      },
      endedSpans,
    );

    expect(data).toMatchObject({
      'vercel.ai.settings.context.requestId': 'req_1',
      'vercel.ai.settings.context.attempt': '2',
      'vercel.ai.settings.context.cached': 'false',
      'vercel.ai.settings.context.user': '{"id":"u1"}',
      'vercel.ai.settings.context.tags': '["a","b"]',
    });
    expect(data).not.toHaveProperty('vercel.ai.settings.context.empty');
    expect(data).not.toHaveProperty('vercel.ai.settings.context.missing');
  });

  it.each(['embed', 'embedMany', 'rerank', 'experimental_decide'] as const)(
    'records runtimeContext on %s spans',
    type => {
      const endedSpans = setupClient();
      const data = spanData(
        { type, event: { aiVersion: '7.0.154', runtimeContext: { tenantId: 'acme' } } },
        endedSpans,
      );
      expect(data['vercel.ai.settings.context.tenantId']).toBe('acme');
    },
  );

  it('ignores runtimeContext from an ai version that does not report aiVersion', () => {
    const endedSpans = setupClient();
    const data = spanData(
      {
        type: 'generateText',
        event: { callId: 'call-1', runtimeContext: { apiToken: 'secret' } },
      },
      endedSpans,
    );

    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('copies runtimeContext to model-call and tool spans of the same operation', () => {
    const endedSpans = setupClient();
    const root: VercelAiChannelMessage = {
      type: 'generateText',
      event: { aiVersion: '7.0.154', callId: 'call-copy', runtimeContext: { tenantId: 'acme' } },
    };
    const rootSpan = createSpanFromMessage(root, {});

    const modelCallData = spanData(
      { type: 'languageModelCall', event: { aiVersion: '7.0.154', callId: 'call-copy', modelId: 'm' } },
      endedSpans,
    );
    const toolData = spanData(
      {
        type: 'executeTool',
        event: {
          aiVersion: '7.0.154',
          callId: 'call-copy',
          toolCall: { toolName: 'getWeather', toolCallId: 'tc-1' },
        },
      },
      endedSpans,
    );
    expect(modelCallData['vercel.ai.settings.context.tenantId']).toBe('acme');
    expect(toolData['vercel.ai.settings.context.tenantId']).toBe('acme');

    clearOperationId(root);
    rootSpan?.end();

    const laterData = spanData(
      { type: 'languageModelCall', event: { aiVersion: '7.0.154', callId: 'call-copy', modelId: 'm' } },
      endedSpans,
    );
    expect(laterData).not.toHaveProperty('vercel.ai.settings.context.tenantId');
  });

  it('records toolContext keys on the tool span', () => {
    const endedSpans = setupClient();
    const data = spanData(
      {
        type: 'executeTool',
        event: {
          aiVersion: '7.0.154',
          callId: 'call-1',
          toolCall: { toolName: 'getWeather', toolCallId: 'tc-1' },
          toolContext: { units: 'metric', region: { code: 'eu' } },
        },
      },
      endedSpans,
    );

    expect(data).toMatchObject({
      'vercel.ai.tool_call.context.units': 'metric',
      'vercel.ai.tool_call.context.region': '{"code":"eu"}',
    });
  });

  it('ignores toolContext from an ai version that does not report aiVersion', () => {
    const endedSpans = setupClient();
    const data = spanData(
      {
        type: 'executeTool',
        event: {
          callId: 'call-1',
          toolCall: { toolName: 'getWeather', toolCallId: 'tc-1' },
          toolContext: { apiKey: 'secret' },
        },
      },
      endedSpans,
    );

    expect(JSON.stringify(data)).not.toContain('secret');
  });
});
