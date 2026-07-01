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
import { ioredisChannelIntegration } from '../../../src/integrations/tracing-channel/ioredis';
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

describe('ioredisChannelIntegration', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    const integration = ioredisChannelIntegration({ responseHook: (...args) => responseHookSpy?.(...args) });
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

  describe('command channel', () => {
    it('creates a db span matching the OTel ioredis shape and runs the response hook', async () => {
      const command = { name: 'get', args: ['test-key'] };
      const { resolved } = await driveCommand(
        CHANNELS.IOREDIS_COMMAND,
        { arguments: [command], self: { options: { host: 'localhost', port: 6380 } } },
        { result: 'value' },
      );

      const span = lastRedisSpan();
      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('get test-key');
      expect(json.op).toBe('db');
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.redis');
      expect(json.data['db.system']).toBe('redis');
      expect(json.data['db.statement']).toBe('get test-key');
      expect(json.data['db.connection_string']).toBe('redis://localhost:6380');
      expect(json.data['net.peer.name']).toBe('localhost');
      expect(json.data['net.peer.port']).toBe(6380);

      expect(resolved).toBe('value');

      expect(responseHookSpy).toHaveBeenCalledTimes(1);
      expect(responseHookSpy).toHaveBeenCalledWith(span, 'get', ['test-key'], 'value');
    });

    it('redacts sensitive command arguments via the statement serializer', async () => {
      const command = { name: 'set', args: ['test-key', 'super-secret-value'] };
      await driveCommand(
        CHANNELS.IOREDIS_COMMAND,
        { arguments: [command], self: { options: { host: 'localhost', port: 6380 } } },
        { result: 'OK' },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('set test-key [1 other arguments]');
      expect(json.data['db.statement']).toBe('set test-key [1 other arguments]');
      expect(JSON.stringify(json)).not.toContain('super-secret-value');
    });

    it('sets error status and does NOT run the response hook on failure', async () => {
      const command = { name: 'incr', args: ['test-key'] };
      await driveCommand(
        CHANNELS.IOREDIS_COMMAND,
        { arguments: [command], self: { options: { host: 'localhost', port: 6380 } } },
        { error: new Error('value is not an integer') },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('incr test-key');
      expect(json.status).toBe('value is not an integer');
      expect(responseHookSpy).not.toHaveBeenCalled();
    });

    it('does not create a span when there is no active parent span', async () => {
      const command = { name: 'get', args: ['test-key'] };
      const { activeInside } = await driveCommand(
        CHANNELS.IOREDIS_COMMAND,
        { arguments: [command], self: { options: { host: 'localhost', port: 6380 } } },
        { result: 'value' },
        { withParent: false },
      );

      expect(lastRedisSpan()).toBeUndefined();
      expect(activeInside ? spanToJSON(activeInside).data['sentry.origin'] : undefined).not.toBe(
        'auto.db.orchestrion.redis',
      );
    });

    it('parents the redis span to the surrounding span', async () => {
      let outerSpanId: string | undefined;
      const command = { name: 'get', args: ['k'] };

      await startSpan({ name: 'outer' }, async outer => {
        outerSpanId = outer.spanContext().spanId;
        const channel = tracingChannel(CHANNELS.IOREDIS_COMMAND);
        await channel
          .tracePromise(async () => 'v', { arguments: [command], self: { options: { host: 'h', port: 1 } } })
          .catch(() => undefined);
      });

      expect(spanToJSON(lastRedisSpan()!).parent_span_id).toBe(outerSpanId);
    });
  });

  describe('connect channel', () => {
    it('creates a connect span', async () => {
      await driveCommand(
        CHANNELS.IOREDIS_CONNECT,
        { self: { options: { host: 'localhost', port: 6380 } } },
        { result: undefined },
      );

      const json = spanToJSON(lastRedisSpan()!);
      expect(json.description).toBe('connect');
      expect(json.op).toBe('db');
      expect(json.data['db.statement']).toBe('connect');
      expect(json.data['db.system']).toBe('redis');
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.redis');
    });
  });
});
