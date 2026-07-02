import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getClient,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getGlobalScope,
  getIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
} from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { kafkajsChannelIntegration } from '../src/integrations/tracing-channel/kafkajs';
import { CHANNELS } from '../src/orchestrion/channels';

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

/**
 * Models the exact code the orchestrion transform emits around an `Async` function: publish `start`
 * (which lets the subscriber mutate `ctx.arguments`), invoke the original with the mutated
 * `ctx.arguments`, then publish `asyncEnd` on success or `error` + `asyncEnd` on failure.
 */
function runThroughChannel<T extends { arguments: unknown[]; result?: unknown; error?: unknown }>(
  // `tracingChannel(name)` returns `TracingChannel<unknown, object>`; we publish to the sub-channels
  // directly (as the transform does), so the exact generic doesn't matter here.
  channel: any,
  ctx: T,
  original: (...args: any[]) => Promise<unknown>,
): Promise<unknown> {
  return (channel.start as any).runStores(ctx, async () => {
    try {
      const result = await original(...ctx.arguments);
      ctx.result = result;
      (channel.asyncStart as any).publish(ctx);
      (channel.asyncEnd as any).publish(ctx);
      return result;
    } catch (error) {
      ctx.error = error;
      (channel.error as any).publish(ctx);
      (channel.asyncStart as any).publish(ctx);
      (channel.asyncEnd as any).publish(ctx);
      throw error;
    }
  });
}

describe('kafkajsChannelIntegration', () => {
  let endedSpans: Span[];

  beforeAll(() => {
    // Subscribe exactly once; the integration has no unsubscribe and re-subscribing would double spans.
    kafkajsChannelIntegration().setupOnce!();
  });

  beforeEach(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    endedSpans = [];
    getClient()!.on('spanEnd', span => {
      endedSpans.push(span);
    });
  });

  afterEach(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  describe('producer (sendBatch channel)', () => {
    const channel = tracingChannel(CHANNELS.KAFKAJS_SEND_BATCH);

    it('creates one producer span per message and propagates trace headers into the call', async () => {
      const message = { value: 'hello' } as { value: string; headers?: Record<string, string> };
      const batch = { topicMessages: [{ topic: 'test-topic', messages: [message] }] };
      const ctx = { arguments: [batch] };

      let seenHeadersDuringSend: Record<string, string> | undefined;
      const result = await runThroughChannel(channel, ctx, async (b: typeof batch) => {
        // The header mutation from `start` must be visible to the original call (trace propagation).
        seenHeadersDuringSend = b.topicMessages[0]!.messages[0]!.headers;
        return [{ topicName: 'test-topic', partition: 0, errorCode: 0 }];
      });

      expect(result).toEqual([{ topicName: 'test-topic', partition: 0, errorCode: 0 }]);
      expect(seenHeadersDuringSend?.['sentry-trace']).toEqual(expect.any(String));

      const producerSpans = endedSpans.map(spanToJSON).filter(s => s.description === 'send test-topic');
      expect(producerSpans).toHaveLength(1);
      expect(producerSpans[0]!.data).toMatchObject({
        'messaging.system': 'kafka',
        'messaging.destination.name': 'test-topic',
        'messaging.operation.name': 'send',
        'messaging.operation.type': 'send',
        'sentry.origin': 'auto.kafkajs.orchestrion.producer',
      });
      // At the core level a successful span carries no explicit status (the OTel export defaults it to
      // `ok`); the important part here is that no error status was applied.
      expect(producerSpans[0]!.status).toBeUndefined();
    });

    it('marks the producer span as errored when the send rejects', async () => {
      const batch = { topicMessages: [{ topic: 'invalid topic name', messages: [{ value: 'x' }] }] };
      const ctx = { arguments: [batch] };

      class KafkaJSNonRetriableError extends Error {}

      await expect(
        runThroughChannel(channel, ctx, async () => {
          throw new KafkaJSNonRetriableError('boom');
        }),
      ).rejects.toThrow('boom');

      const span = endedSpans.map(spanToJSON).find(s => s.description === 'send invalid topic name');
      expect(span).toBeDefined();
      // Error status was applied (serialized as the error message at the core level; the OTel export
      // maps it to `internal_error`). The `error.type` attribute mirrors the OTel instrumentation.
      expect(span!.status).not.toBe('ok');
      expect(span!.status).toBeDefined();
      expect(span!.data['error.type']).toBe('KafkaJSNonRetriableError');
    });
  });

  describe('consumer (run channel)', () => {
    const channel = tracingChannel(CHANNELS.KAFKAJS_CONSUMER_RUN);

    it('wraps eachMessage so each processed message becomes a consumer span', async () => {
      let userCallbackRan = false;
      const config = {
        eachMessage: async (_payload: unknown) => {
          userCallbackRan = true;
        },
      };
      const ctx = { arguments: [config] };

      // The runner invokes the (now-wrapped) eachMessage read off the config the transform passed on.
      await runThroughChannel(channel, ctx, async (cfg: typeof config) => {
        await cfg.eachMessage({ topic: 'test-topic', partition: 0, message: { headers: {}, value: 'v' } } as any);
      });

      expect(userCallbackRan).toBe(true);

      const consumerSpans = endedSpans.map(spanToJSON).filter(s => s.description === 'process test-topic');
      expect(consumerSpans).toHaveLength(1);
      expect(consumerSpans[0]!.data).toMatchObject({
        'messaging.system': 'kafka',
        'messaging.destination.name': 'test-topic',
        'messaging.operation.type': 'process',
        'sentry.origin': 'auto.kafkajs.orchestrion.consumer',
      });
    });

    it('leaves a config without callbacks untouched', async () => {
      const config = {} as { eachMessage?: unknown };
      const ctx = { arguments: [config] };

      await runThroughChannel(channel, ctx, async () => undefined);

      expect(config.eachMessage).toBeUndefined();
      expect(endedSpans).toHaveLength(0);
    });
  });
});
