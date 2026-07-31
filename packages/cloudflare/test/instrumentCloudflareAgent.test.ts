import type { Event } from '@sentry/core';
import { getCurrentScope, setCurrentClient } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils/no-diagnostic-channels';
import { CloudflareClient, type CloudflareClientOptions } from '../src/client';
import { instrumentCloudflareAgent } from '../src/instrumentations/agents';
import { resetSdk } from './testUtils';

const dsn = 'https://123@sentry.io/42';

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
  let client: CloudflareClient;

  beforeEach(() => {
    resetSdk();
    setAsyncLocalStorageAsyncContextStrategy();

    transactions = [];

    const options: CloudflareClientOptions = {
      dsn,
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      stackParser: () => [],
      integrations: [],
      transport: () => ({
        send: vi.fn().mockResolvedValue({}),
        flush: vi.fn().mockResolvedValue(true),
      }),
      beforeSendTransaction: event => {
        transactions.push(event);
        return event;
      },
    };

    client = new CloudflareClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

      const result = agent.onMessage({}, JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: ['World'] }));

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
            'cloudflare.agent.class': 'MyAgent',
            'cloudflare.agent.name': 'instance-1',
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
          this.seenConversationId = getCurrentScope().getScopeData().conversationId;
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
    it('sets the conversation id from the instance name during a chat turn', () => {
      const agent = createFakeAgent({
        name: 'thread-abc',
        onChatMessage(this: any) {
          // Capture what the scope sees while the turn is running.
          this.seenConversationId = getCurrentScope().getScopeData().conversationId;
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      const result = agent.onChatMessage(() => {}, {});

      expect(result).toBe('response');
      expect(agent.seenConversationId).toBe('thread-abc');
    });

    it('sets the conversation id during callable RPC execution on plain (non-chat) agents', () => {
      const agent = createFakeAgent({
        onMessage(this: any, _connection: unknown, message: unknown) {
          // Capture what the scope sees while the RPC method is running.
          this.seenConversationId = getCurrentScope().getScopeData().conversationId;
          this.messages.push(message);
          return 'handled';
        },
      });
      instrumentCloudflareAgent(agent);

      // A plain Agent has no `onChatMessage`; the RPC call is its unit of work.
      agent.onMessage({}, JSON.stringify({ type: 'rpc', id: '1', method: 'greet', args: [] }));

      expect(agent.seenConversationId).toBe('instance-1');
      expect('onChatMessage' in agent).toBe(false);
    });

    it('sets the conversation id during an HTTP request', () => {
      const agent = createFakeAgent({
        onRequest(this: any) {
          this.seenConversationId = getCurrentScope().getScopeData().conversationId;
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      const result = agent.onRequest(new Request('https://example.com/agents/my-agent/instance-1'));

      expect(result).toBe('response');
      expect(agent.seenConversationId).toBe('instance-1');
    });

    it('prefers the rotated conversation id over the instance name on the HTTP path', () => {
      const agent = createFakeAgent({
        onRequest(this: any) {
          this.seenConversationId = getCurrentScope().getScopeData().conversationId;
          return 'response';
        },
      });
      instrumentCloudflareAgent(agent);

      agent._emit?.('message:clear');
      agent.__sentryConversationId = 'rotated-id';
      agent.onRequest(new Request('https://example.com/agents/my-agent/instance-1'));

      expect(agent.seenConversationId).toBe('rotated-id');
    });

    it('does not throw when the agent has no onRequest handler', () => {
      const agent = createFakeAgent();

      expect(() => instrumentCloudflareAgent(agent)).not.toThrow();
      expect('onRequest' in agent).toBe(false);
    });
  });
});
