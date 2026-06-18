import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getGlobalScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRedisDiagnosticChannelsForTesting,
  IOREDIS_DC_CHANNEL_COMMAND,
  IOREDIS_DC_CHANNEL_CONNECT,
  REDIS_DC_CHANNEL_BATCH,
  REDIS_DC_CHANNEL_COMMAND,
  REDIS_DC_CHANNEL_CONNECT,
  type RedisTracingChannelFactory,
  subscribeRedisDiagnosticChannels,
} from '../../src/redis/redis-dc-subscriber';

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
    return (
      asyncStorage.getStore() || {
        scope: getDefaultCurrentScope(),
        isolationScope: getDefaultIsolationScope(),
      }
    );
  }

  setAsyncContextStrategy({
    withScope: callback => {
      const scope = getScopes().scope.clone();
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withSetScope: (scope, callback) => {
      const isolationScope = getScopes().isolationScope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(scope));
    },
    withIsolationScope: callback => {
      const scope = getScopes().scope;
      const isolationScope = getScopes().isolationScope.clone();
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    withSetIsolationScope: (isolationScope, callback) => {
      const scope = getScopes().scope;
      return asyncStorage.run({ scope, isolationScope }, () => callback(isolationScope));
    },
    getCurrentScope: () => getScopes().scope,
    getIsolationScope: () => getScopes().isolationScope,
    getTracingChannelBinding: () => ({
      asyncLocalStorage: asyncStorage,
      getStoreWithActiveSpan: span => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

/** Drives a channel's `tracePromise` and captures the span bound by the subscriber. */
async function traceCommand(
  channelName: string,
  data: Record<string, unknown>,
  outcome: { result?: unknown; error?: Error },
): Promise<{ span: Span | undefined; childParentSpanId: string | undefined }> {
  const channel = tracingChannel(channelName);
  let span: Span | undefined;
  let childParentSpanId: string | undefined;

  const run = channel.tracePromise(async () => {
    span = getActiveSpan();
    startSpan({ name: 'child' }, child => {
      childParentSpanId = spanToJSON(child).parent_span_id;
    });
    if (outcome.error) {
      throw outcome.error;
    }
    return outcome.result;
  }, data);

  await run.catch(() => undefined);

  return { span, childParentSpanId };
}

const factory = tracingChannel as RedisTracingChannelFactory;

describe('subscribeRedisDiagnosticChannels', () => {
  let responseHook: ReturnType<typeof vi.fn>;
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  // `node:diagnostics_channel` channels are process-global. `_reset…` calls each binding's `unbind`,
  // so we can subscribe and fully detach per test without handlers leaking across tests.
  beforeEach(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    responseHook = vi.fn();
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
    subscribeRedisDiagnosticChannels(factory, responseHook);
  });

  afterEach(() => {
    _resetRedisDiagnosticChannelsForTesting();
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  describe('node-redis command channel', () => {
    it('creates a db.redis span, runs the response hook with sliced args, and ends the span', async () => {
      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_COMMAND,
        { command: 'GET', args: ['GET', 'cache:key'], serverAddress: '127.0.0.1', serverPort: 6379 },
        { result: 'hit-value' },
      );

      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('redis-GET');
      expect(json.op).toBe('db.redis');
      expect(json.data['db.system.name']).toBe('redis');
      expect(json.data['db.query.text']).toBe('GET cache:key');
      expect(json.timestamp).toBeDefined();

      // command name is stripped from args before the hook sees them
      expect(responseHook).toHaveBeenCalledWith(span, 'GET', ['cache:key'], 'hit-value');
    });

    it('sets error status and does NOT capture an exception on failure', async () => {
      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_COMMAND,
        { command: 'SET', args: ['SET', 'k', 'v'] },
        { error: new Error('ECONNREFUSED') },
      );

      expect(spanToJSON(span!).status).toBe('ECONNREFUSED');
      expect(spanToJSON(span!).timestamp).toBeDefined();
      expect(responseHook).not.toHaveBeenCalled();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('parents the redis span to the surrounding span and parents children to the redis span', async () => {
      let outerSpanId: string | undefined;
      let result: Awaited<ReturnType<typeof traceCommand>> | undefined;

      await startSpan({ name: 'outer' }, async outer => {
        outerSpanId = outer.spanContext().spanId;
        result = await traceCommand(REDIS_DC_CHANNEL_COMMAND, { command: 'GET', args: ['GET', 'k'] }, { result: 'v' });
      });

      expect(spanToJSON(result!.span!).parent_span_id).toBe(outerSpanId);
      expect(result!.childParentSpanId).toBe(result!.span!.spanContext().spanId);
    });
  });

  describe('ioredis command channel', () => {
    it('does not slice the first arg (ioredis omits the command name)', async () => {
      const { span } = await traceCommand(
        IOREDIS_DC_CHANNEL_COMMAND,
        { command: 'mget', args: ['key1', 'key2'] },
        { result: ['v1', 'v2'] },
      );

      expect(spanToJSON(span!).data['db.query.text']).toBe('mget key1 key2');
      expect(responseHook).toHaveBeenCalledWith(span, 'mget', ['key1', 'key2'], ['v1', 'v2']);
    });
  });

  describe('batch channel', () => {
    it('creates a batch span and ends it', async () => {
      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_BATCH,
        { batchMode: 'PIPELINE', batchSize: 3 },
        { result: ['OK', 'OK', 'OK'] },
      );

      expect(spanToJSON(span!).description).toBe('PIPELINE');
      expect(spanToJSON(span!).op).toBe('db.redis');
      expect(spanToJSON(span!).timestamp).toBeDefined();
    });

    it('sets error status without capturing on failure', async () => {
      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_BATCH,
        { batchMode: 'MULTI' },
        { error: new Error('MULTI aborted') },
      );

      expect(spanToJSON(span!).status).toBe('MULTI aborted');
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });

  describe('connect channel', () => {
    it('creates a db.redis.connect span', async () => {
      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_CONNECT,
        { serverAddress: '127.0.0.1', serverPort: 6379 },
        { result: undefined },
      );

      expect(spanToJSON(span!).description).toBe('redis-connect');
      expect(spanToJSON(span!).op).toBe('db.redis.connect');
      expect(spanToJSON(span!).timestamp).toBeDefined();
    });

    it('also subscribes the ioredis connect channel', async () => {
      const { span } = await traceCommand(
        IOREDIS_DC_CHANNEL_CONNECT,
        { serverAddress: 'localhost', serverPort: 6379 },
        { result: undefined },
      );

      expect(spanToJSON(span!).op).toBe('db.redis.connect');
      expect(spanToJSON(span!).timestamp).toBeDefined();
    });
  });

  describe('idempotency', () => {
    it('does not re-subscribe on a second call, but updates the response hook', async () => {
      const secondHook = vi.fn();
      subscribeRedisDiagnosticChannels(factory, secondHook);

      const { span } = await traceCommand(
        REDIS_DC_CHANNEL_COMMAND,
        { command: 'GET', args: ['GET', 'k'] },
        { result: 'v' },
      );

      expect(secondHook).toHaveBeenCalledWith(span, 'GET', ['k'], 'v');
      expect(responseHook).not.toHaveBeenCalled();
    });
  });
});
