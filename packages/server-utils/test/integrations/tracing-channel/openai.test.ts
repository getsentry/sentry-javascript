import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
} from '@sentry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openaiChannelIntegration } from '../../../src/integrations/tracing-channel/openai';
import { CHANNELS } from '../../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

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

function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return asyncStorage.getStore() || { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
  }

  setAsyncContextStrategy({
    withScope: callback => {
      const scope = getScopes().scope.clone();
      return asyncStorage.run({ scope, isolationScope: getScopes().isolationScope }, () => callback(scope));
    },
    withSetScope: (scope, callback) =>
      asyncStorage.run({ scope, isolationScope: getScopes().isolationScope }, () => callback(scope)),
    withIsolationScope: callback => {
      const isolationScope = getScopes().isolationScope.clone();
      return asyncStorage.run({ scope: getScopes().scope, isolationScope }, () => callback(isolationScope));
    },
    withSetIsolationScope: (isolationScope, callback) =>
      asyncStorage.run({ scope: getScopes().scope, isolationScope }, () => callback(isolationScope)),
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => ({
      asyncLocalStorage: asyncStorage,
      getStoreWithActiveSpan: span => {
        const scope = getScopes().scope.clone();
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope: getScopes().isolationScope };
      },
    }),
  });
}

interface ChatContext {
  arguments: unknown[];
  result?: unknown;
  error?: unknown;
  _sentrySpan?: Span;
}

const MOCK_RESPONSE = {
  id: 'chatcmpl-mock123',
  object: 'chat.completion',
  model: 'gpt-3.5-turbo',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
};

describe('openaiChannelIntegration', () => {
  const channel = tracingChannel<ChatContext>(CHANNELS.OPENAI_CHAT);
  // Grab the span the integration opens by reading it back off the shared context object.
  let lastSpan: Span | undefined;

  beforeAll(() => {
    // The async context strategy must exist before `setupOnce`, so `waitForTracingChannelBinding`
    // finds the binding and subscribes synchronously. The client makes `startInactiveSpan` sampled.
    installTestAsyncContextStrategy();
    initTestClient();
    openaiChannelIntegration().setupOnce?.();
    channel.subscribe({
      asyncEnd: data => {
        lastSpan = data._sentrySpan;
      },
    });
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  it('opens a gen_ai.chat span with request + response attributes on a successful call', async () => {
    lastSpan = undefined;
    await channel.tracePromise(() => Promise.resolve(MOCK_RESPONSE), {
      arguments: [{ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }], temperature: 0.7 }],
    });

    expect(lastSpan).toBeDefined();
    const json = spanToJSON(lastSpan!);
    expect(json.description).toBe('chat gpt-3.5-turbo');
    expect(json.op).toBe('gen_ai.chat');
    expect(json.origin).toBe('auto.ai.orchestrion.openai');
    expect(json.data['gen_ai.system']).toBe('openai');
    expect(json.data['gen_ai.operation.name']).toBe('chat');
    expect(json.data['gen_ai.request.model']).toBe('gpt-3.5-turbo');
    expect(json.data['gen_ai.response.id']).toBe('chatcmpl-mock123');
    expect(json.data['gen_ai.usage.total_tokens']).toBe(25);
  });

  it('does not open a span for streaming requests', async () => {
    lastSpan = undefined;
    await channel.tracePromise(() => Promise.resolve({}), {
      arguments: [{ model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }], stream: true }],
    });

    expect(lastSpan).toBeUndefined();
  });

  it('marks the span with error status when the call rejects', async () => {
    lastSpan = undefined;
    await channel
      .tracePromise(() => Promise.reject(new Error('boom')), {
        arguments: [{ model: 'error-model', messages: [{ role: 'user', content: 'hi' }] }],
      })
      .catch(() => undefined);

    expect(lastSpan).toBeDefined();
    // `bindTracingChannelToSpan` sets the error status message to the thrown error's message.
    expect(spanToJSON(lastSpan!).status).toBe('boom');
  });
});
