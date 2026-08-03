import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_shouldSkipAiProviderWrapping,
  Client,
  createTransport,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  initAndBind,
  resolvedSyncPromise,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSpanFromMessage } from '../../src/vercel-ai/vercel-ai-dc-subscriber';

// Must match `WORKERS_AI_INTEGRATION_NAME` in core's `tracing/workers-ai/constants`.
const WORKERS_AI_INTEGRATION_NAME = 'WorkersAI';

class TestClient extends Client<any> {
  public eventFromException(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }

  public eventFromMessage(): PromiseLike<any> {
    return resolvedSyncPromise({});
  }
}

function initTestClient(): void {
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
}

describe('vercel ai tracing channel: workers-ai dedup', () => {
  beforeEach(() => {
    _INTERNAL_clearAiProviderSkips();
    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
    initTestClient();
  });

  afterEach(() => {
    _INTERNAL_clearAiProviderSkips();
  });

  it('marks Workers AI as skipped on a model call, so the binding does not double-instrument', () => {
    expect(_INTERNAL_shouldSkipAiProviderWrapping(WORKERS_AI_INTEGRATION_NAME)).toBe(false);

    const span = createSpanFromMessage(
      {
        type: 'languageModelCall',
        event: { provider: 'workers-ai', modelId: '@cf/meta/llama-3.1-8b-instruct' },
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();

    expect(_INTERNAL_shouldSkipAiProviderWrapping(WORKERS_AI_INTEGRATION_NAME)).toBe(true);
  });

  it('does not mark Workers AI as skipped for tool calls', () => {
    // A tool calling `env.AI.run` itself is a genuine separate inference the `ai` SDK does not
    // instrument, so it must keep its own span.
    const span = createSpanFromMessage(
      {
        type: 'executeTool',
        event: { toolName: 'getWeather', toolCallId: 'call_1' },
      } as Parameters<typeof createSpanFromMessage>[0],
      {} as Parameters<typeof createSpanFromMessage>[1],
    );
    span?.end();

    expect(_INTERNAL_shouldSkipAiProviderWrapping(WORKERS_AI_INTEGRATION_NAME)).toBe(false);
  });
});
