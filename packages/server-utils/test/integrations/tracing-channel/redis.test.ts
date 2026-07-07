import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getClient,
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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisChannelIntegration } from '../../../src/integrations/tracing-channel/redis';
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

let responseHookSpy: ReturnType<typeof vi.fn> | undefined;
const endedSpans: Span[] = [];

async function driveCommand(
  channelName: string,
  context: Record<string, unknown>,
  outcome: { result?: unknown; error?: Error },
  { withParent = true }: { withParent?: boolean } = {},
): Promise<{ activeInside: Span | undefined; resolved: unknown }> {
  const channel = tracingChannel(channelName);
  let activeInside: Span | undefined;
  let resolved: unknown;

  const drive = async (): Promise<void> => {
    const run = channel.tracePromise(async () => {
      activeInside = getActiveSpan();
      if (outcome.error) {
        throw outcome.error;
      }
      return outcome.result;
    }, context);
    resolved = await run.catch(() => undefined);
  };

  if (withParent) {
    await startSpan({ name: 'parent' }, drive);
  } else {
    await drive();
  }

  return { activeInside, resolved };
}

function lastRedisSpan(): Span | undefined {
  return endedSpans.filter(s => spanToJSON(s).data['sentry.origin'] === 'auto.db.orchestrion.redis').at(-1);
}

describe('redisChannelIntegration', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    const integration = redisChannelIntegration({ responseHook: (...args) => responseHookSpy?.(...args) });
    integration.setupOnce?.();
    getClient()?.on('spanEnd', span => endedSpans.push(span));
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    endedSpans.length = 0;
    responseHookSpy = vi.fn();
  });

  describe('node-redis command channel (sendCommand)', () => {
    const clientSelf = { options: { socket: { host: 'localhost', port: 6380 }, url: 'redis://localhost:6380' } };

    it('creates a db span matching the OTel redis shape and runs the response hook', async () => {
      const { resolved } = await driveCommand(
        CHANNELS.NODE_REDIS_COMMAND,
        { arguments: [['GET', 'test-key'], undefined], self: clientSelf },
        { result: 'value' },
      );

      const span = lastRedisSpan();
      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('redis-GET');
      expect(json.op).toBe('db');
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.redis');
      expect(json.data['db.system']).toBe('redis');
      expect(json.data['db.statement']).toBe('GET test-key');
      expect(json.data['db.connection_string']).toBe('redis://localhost:6380');
      expect(json.data['net.peer.name']).toBe('localhost');
      expect(json.data['net.peer.port']).toBe(6380);

      expect(resolved).toBe('value');
      expect(responseHookSpy).toHaveBeenCalledTimes(1);
      expect(responseHookSpy).toHaveBeenCalledWith(span, 'GET', ['test-key'], 'value');
    });

    it('redacts sensitive command arguments via the statement serializer', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_COMMAND,
        { arguments: [['SET', 'test-key', 'super-secret-value'], undefined], self: clientSelf },
        { result: 'OK' },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('redis-SET');
      expect(json.data['db.statement']).toBe('SET test-key [1 other arguments]');
      expect(JSON.stringify(json)).not.toContain('super-secret-value');
    });

    it('sets error status and does NOT run the response hook on failure', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_COMMAND,
        { arguments: [['INCR', 'test-key'], undefined], self: clientSelf },
        { error: new Error('value is not an integer') },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('redis-INCR');
      expect(json.status).toBe('value is not an integer');
      expect(responseHookSpy).not.toHaveBeenCalled();
    });

    it('creates a span even without an active parent (OTel redis has no requireParentSpan)', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_COMMAND,
        { arguments: [['GET', 'test-key'], undefined], self: clientSelf },
        { result: 'value' },
        { withParent: false },
      );

      expect(lastRedisSpan()).toBeDefined();
    });
  });

  describe('node-redis executor channel (commandsExecutor)', () => {
    const command = { transformArguments: (...args: unknown[]) => ['SET', ...(args as string[])] };
    const clientSelf = { options: { socket: { host: 'h', port: 1 } } };

    it('derives wire args via transformArguments', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_EXECUTOR,
        { arguments: [command, ['my-key', 'my-value']], self: clientSelf },
        { result: 'OK' },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('redis-SET');
      expect(json.data['db.statement']).toBe('SET my-key [1 other arguments]');
      expect(responseHookSpy).toHaveBeenCalledWith(expect.anything(), 'SET', ['my-key', 'my-value'], 'OK');
    });

    it('strips a leading command-options object before deriving wire args', async () => {
      const commandOptions: Record<string | symbol, unknown> = { [Symbol('Command Options')]: true };
      const spy = vi.fn((...args: unknown[]) => ['GET', ...(args as string[])]);

      await driveCommand(
        CHANNELS.NODE_REDIS_EXECUTOR,
        { arguments: [{ transformArguments: spy }, [commandOptions, 'my-key']], self: clientSelf },
        { result: 'value' },
      );

      expect(spy).toHaveBeenCalledWith('my-key');
      expect(spanToJSON(lastRedisSpan()!).description).toBe('redis-GET');
    });
  });

  describe('node-redis connect channel', () => {
    it('creates a connect span', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_CONNECT,
        { self: { options: { socket: { host: 'localhost', port: 6380 }, url: 'redis://user:pass@localhost:6380' } } },
        { result: undefined },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('redis-connect');
      expect(json.op).toBe('db');
      expect(json.data['db.system']).toBe('redis');
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.redis');
      expect(json.data['db.statement']).toBeUndefined();
      // credentials are stripped from the connection string
      expect(json.data['db.connection_string']).toBe('redis://localhost:6380');
    });
  });

  describe('redis v2-v3 command channel (internal_send_command)', () => {
    const legacySelf = { connection_options: { host: 'localhost', port: 6379 }, address: 'localhost:6379' };

    function driveLegacy(commandObj: Record<string, unknown>, { throwErr }: { throwErr?: Error } = {}): void {
      const channel = tracingChannel(CHANNELS.REDIS_COMMAND);
      try {
        channel.traceSync(
          () => {
            if (throwErr) {
              throw throwErr;
            }
          },
          { arguments: [commandObj], self: legacySelf },
        );
      } catch {
        // the sync-throw path is asserted via the span below
      }
    }

    it('opens a span, ends it in the wrapped callback and runs the response hook', () => {
      const callback = vi.fn((_err: unknown, reply: unknown) => `wrapped:${reply}`);
      const commandObj: Record<string, unknown> = { command: 'get', args: ['test-key'], callback };

      driveLegacy(commandObj);
      // The command has only been queued; the span ends when the callback fires.
      expect(lastRedisSpan()).toBeUndefined();

      const returned = (commandObj.callback as (e: unknown, r: unknown) => unknown)(null, 'value');
      // The original callback's return value is preserved.
      expect(returned).toBe('wrapped:value');
      expect(callback).toHaveBeenCalledWith(null, 'value');

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('redis-get');
      expect(json.data['db.system']).toBe('redis');
      expect(json.data['db.statement']).toBe('get test-key');
      expect(json.data['net.peer.name']).toBe('localhost');
      expect(json.data['net.peer.port']).toBe(6379);
      expect(json.data['db.connection_string']).toBe('redis://localhost:6379');
      expect(responseHookSpy).toHaveBeenCalledWith(expect.anything(), 'get', ['test-key'], 'value');
    });

    it('sets error status and skips the response hook when the callback reports an error', () => {
      const commandObj: Record<string, unknown> = { command: 'incr', args: ['test-key'], callback: vi.fn() };

      driveLegacy(commandObj);
      (commandObj.callback as (e: unknown, r: unknown) => unknown)(new Error('not an integer'), undefined);

      expect(spanToJSON(lastRedisSpan()!).status).toBe('not an integer');
      expect(responseHookSpy).not.toHaveBeenCalled();
    });

    it('ends the span with error status on a synchronous throw', () => {
      const commandObj: Record<string, unknown> = { command: 'get', args: ['k'], callback: vi.fn() };

      driveLegacy(commandObj, { throwErr: new Error('connection lost') });

      expect(spanToJSON(lastRedisSpan()!).status).toBe('connection lost');
    });

    it('does not open a span for a callback-less command (no signal to end it on)', () => {
      driveLegacy({ command: 'get', args: ['k'] });

      expect(lastRedisSpan()).toBeUndefined();
    });
  });

  describe('node-redis batch channels', () => {
    const clientSelf = { options: { socket: { host: 'localhost', port: 6380 } } };
    const queue = [{ args: ['SET', 'a', '1'] }, { args: ['GET', 'a'] }];

    it('creates a single MULTI span with batch size (v5 _executeMulti)', async () => {
      await driveCommand(CHANNELS.NODE_REDIS_MULTI, { arguments: [queue, 0], self: clientSelf }, { result: [] });

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('MULTI');
      expect(json.op).toBe('db.redis');
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.redis');
      expect(json.data['db.system.name']).toBe('redis');
      expect(json.data['db.operation.batch.size']).toBe(2);
      expect(json.data['server.address']).toBe('localhost');
      expect(json.data['server.port']).toBe(6380);
    });

    it('creates a single PIPELINE span (v5 _executePipeline)', async () => {
      await driveCommand(CHANNELS.NODE_REDIS_PIPELINE, { arguments: [queue, 0], self: clientSelf }, { result: [] });

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('PIPELINE');
      expect(json.data['db.operation.batch.size']).toBe(2);
    });

    it('derives MULTI vs PIPELINE from the chainId arg (v4 multiExecutor)', async () => {
      await driveCommand(
        CHANNELS.NODE_REDIS_BATCH,
        { arguments: [queue, 0, Symbol('chain')], self: clientSelf },
        { result: [] },
      );
      expect(spanToJSON(lastRedisSpan()!).description).toBe('MULTI');

      await driveCommand(CHANNELS.NODE_REDIS_BATCH, { arguments: [queue, 0], self: clientSelf }, { result: [] });
      expect(spanToJSON(lastRedisSpan()!).description).toBe('PIPELINE');
    });
  });
});
