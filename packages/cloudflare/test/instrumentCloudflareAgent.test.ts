import type { Event, SpanJSON } from '@sentry/core';
import {
  conversationIdIntegration,
  getCurrentScope,
  getIsolationScope,
  setConversationId,
  setCurrentClient,
  startSpan,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '../src/async';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { instrumentCloudflareAgent } from '../src/instrumentations/agents';
import { resetSdk } from './testUtils';

const dsn = 'https://123@sentry.io/42';

/** Resolves the conversation id the way `conversationIdIntegration` does at `spanStart`. */
function effectiveConversationId(): string | undefined {
  return getCurrentScope().getScopeData().conversationId || getIsolationScope().getScopeData().conversationId;
}

/** Minimal stand-in for an `agents` Agent instance exposing the internals we hook. */
function createFakeAgent(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    _ParentClass: { name: 'MyAgent' },
    name: 'instance-1',
    messages: [] as unknown[],
    onMessage(this: any, _connection: unknown, message: unknown) {
      this.messages.push(message);
      return 'handled';
    },
    ...overrides,
  };
}

describe('instrumentCloudflareAgent', () => {
  let transactions: Event[];
  let childSpans: SpanJSON[];
  let client: CloudflareClient;

  beforeEach(() => {
    resetSdk();
    setAsyncLocalStorageAsyncContextStrategy();

    transactions = [];
    childSpans = [];

    const options: CloudflareClientOptions = {
      dsn,
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      stackParser: () => [],
      // The integration that turns the scope's conversation id into `gen_ai.conversation.id`, so the
      // tests below assert the attribute the way it actually reaches Sentry.
      integrations: [conversationIdIntegration()],
      transport: () => ({
        send: vi.fn().mockResolvedValue({}),
        flush: vi.fn().mockResolvedValue(true),
      }),
      beforeSendTransaction: event => {
        transactions.push(event);
        return event;
      },
      beforeSendSpan: span => {
        childSpans.push(span);
        return span;
      },
    };

    client = new CloudflareClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The `gen_ai.conversation.id` that reached the transport, read off the sent span rather than the
   * enclosing transaction: a gen_ai span started inside a callable RPC method is a child of the `rpc`
   * span, so it is only ever sent as a span.
   */
  function genAiConversationId(): unknown {
    return childSpans.find(span => span.op === 'gen_ai.chat')?.data['gen_ai.conversation.id'];
  }

  it('returns the same instance', () => {
    const agent = createFakeAgent();
    expect(instrumentCloudflareAgent(agent)).toBe(agent);
  });

  it('does not throw when the Agent internals are missing', () => {
    const agent = { name: 'nope' } as Record<string, unknown>;
    expect(() => instrumentCloudflareAgent(agent)).not.toThrow();
  });

  describe('onMessage → callable RPC spans', () => {
    it('creates an rpc span named after the method for RPC messages', async () => {
      const agent = createFakeAgent();
      instrumentCloudflareAgent(agent);

      const result = await agent.onMessage(
        {},
        JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: ['World'] }),
      );

      expect(result).toBe('handled');
      expect(agent.messages).toHaveLength(1);

      await client.flush();

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.transaction).toBe('greet');
      expect(transactions[0]?.contexts?.trace).toEqual(
        expect.objectContaining({
          op: 'rpc',
          origin: 'auto.faas.cloudflare.agents',
          data: expect.objectContaining({
            'gen_ai.agent.name': 'MyAgent',
          }),
        }),
      );
    });

    it('does not create a span for non-RPC messages', async () => {
      const agent = createFakeAgent();
      instrumentCloudflareAgent(agent);

      agent.onMessage({}, JSON.stringify({ type: 'cf_agent_state', state: {} }));
      agent.onMessage({}, 'not json');

      await client.flush();

      expect(agent.messages).toHaveLength(2);
      expect(transactions).toHaveLength(0);
    });

    it('does not set the conversation id for non-RPC messages', () => {
      const agent = createFakeAgent({
        onMessage(this: any, _connection: unknown, message: unknown) {
          this.seenConversationId = effectiveConversationId();
          this.messages.push(message);
          return 'handled';
        },
      });
      instrumentCloudflareAgent(agent);

      agent.onMessage({}, JSON.stringify({ type: 'cf_agent_state', state: {} }));

      expect(agent.seenConversationId).toBeUndefined();
    });
  });

  describe('conversation id', () => {
    /** `uuid4()` from `@sentry/core` returns 32 hex characters, without dashes. */
    const UUID_PATTERN = /^[0-9a-f]{32}$/;

    it('sets a generated conversation id during a chat turn', async () => {
      const agent = createFakeAgent({
        name: 'thread-abc',
        onChatMessage(this: any) {
          // Capture what the scope sees while the turn is running.
          this.seenConversationId = effectiveConversationId();
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      const result = await agent.onChatMessage(() => {}, {});

      expect(result).toBe('response');
      expect(agent.seenConversationId).toMatch(UUID_PATTERN);
    });

    it('sets the conversation id during callable RPC execution on plain (non-chat) agents', async () => {
      const agent = createFakeAgent({
        onMessage(this: any, _connection: unknown, message: unknown) {
          // Capture what the scope sees while the RPC method is running.
          this.seenConversationId = effectiveConversationId();
          this.messages.push(message);
          return 'handled';
        },
      });
      instrumentCloudflareAgent(agent);

      // A plain Agent has no `onChatMessage`; the RPC call is its unit of work.
      await agent.onMessage({}, JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: [] }));

      expect(agent.seenConversationId).toMatch(UUID_PATTERN);
      expect('onChatMessage' in agent).toBe(false);
    });

    it('sets the conversation id during an HTTP request', async () => {
      const agent = createFakeAgent({
        onRequest(this: any) {
          this.seenConversationId = effectiveConversationId();
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      const result = await agent.onRequest(new Request('https://example.com/agents/my-agent/instance-1'));

      expect(result).toBe('response');
      expect(agent.seenConversationId).toMatch(UUID_PATTERN);
    });

    it('never uses the instance name as the conversation id', async () => {
      const agent = createFakeAgent({
        name: 'thread-abc',
        onRequest(this: any) {
          this.seenConversationId = effectiveConversationId();
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      await agent.onRequest(new Request('https://example.com/agents/my-agent/thread-abc'));

      expect(agent.seenConversationId).not.toBe('thread-abc');
    });

    it('uses the persisted conversation id on the HTTP path', async () => {
      const agent = createFakeAgent({
        // Simulates a hibernation wake: only storage carries the conversation id over.
        ctx: {
          originalStorage: { get: async () => 'persisted-id', put: async () => undefined },
        },
        onRequest(this: any) {
          this.seenConversationId = effectiveConversationId();
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      await agent.onRequest(new Request('https://example.com/agents/my-agent/instance-1'));

      expect(agent.seenConversationId).toBe('persisted-id');
    });

    it('does not throw when the agent has no onRequest handler', () => {
      const agent = createFakeAgent();

      expect(() => instrumentCloudflareAgent(agent)).not.toThrow();
      expect('onRequest' in agent).toBe(false);
    });

    it('stamps the agent conversation id on gen_ai spans created inside a chat turn', async () => {
      const agent = createFakeAgent({
        onChatMessage() {
          return startSpan({ name: 'chat gpt-4', op: 'gen_ai.chat' }, () => 'response');
        },
      });
      instrumentCloudflareAgent(agent);

      await agent.onChatMessage(() => {}, {});
      await client.flush();

      expect(genAiConversationId()).toMatch(UUID_PATTERN);
    });

    it('lets a conversation id set manually inside onRequest take over the request', async () => {
      const agent = createFakeAgent({
        onRequest(this: any) {
          this.seenConversationId = effectiveConversationId();

          setConversationId('user-chosen-id');

          return startSpan({ name: 'chat gpt-4', op: 'gen_ai.chat' }, () => 'response');
        },
      });
      instrumentCloudflareAgent(agent);

      await agent.onRequest(new Request('https://example.com/agents/my-agent/instance-1'));
      await client.flush();

      // The wrapper sets its id before invoking the handler, so the manual call lands afterwards.
      expect(agent.seenConversationId).toMatch(UUID_PATTERN);
      expect(genAiConversationId()).toBe('user-chosen-id');
    });

    it('lets a conversation id set manually inside a callable RPC method take over the call', async () => {
      const agent = createFakeAgent({
        onMessage(this: any) {
          setConversationId('user-chosen-id');

          return startSpan({ name: 'chat gpt-4', op: 'gen_ai.chat' }, () => 'handled');
        },
      });
      instrumentCloudflareAgent(agent);

      await agent.onMessage({}, JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: [] }));
      await client.flush();

      expect(genAiConversationId()).toBe('user-chosen-id');
    });

    it('lets a conversation id set manually inside onChatMessage take over the turn', async () => {
      const agent = createFakeAgent({
        onChatMessage(this: any) {
          // The id we put on the scope is already there when the user's handler runs.
          this.seenConversationId = effectiveConversationId();

          // A user may prefer to key the conversation on an id from their own domain.
          setConversationId('user-chosen-id');

          return startSpan({ name: 'chat gpt-4', op: 'gen_ai.chat' }, () => 'response');
        },
      });
      instrumentCloudflareAgent(agent);

      const result = await agent.onChatMessage(() => {}, {});
      await client.flush();

      expect(result).toBe('response');
      expect(agent.seenConversationId).toMatch(UUID_PATTERN);

      expect(genAiConversationId()).toBe('user-chosen-id');
    });
  });
});
