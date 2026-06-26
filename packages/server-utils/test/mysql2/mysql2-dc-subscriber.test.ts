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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MYSQL2_DC_CHANNEL_CONNECT,
  MYSQL2_DC_CHANNEL_EXECUTE,
  MYSQL2_DC_CHANNEL_POOL_CONNECT,
  MYSQL2_DC_CHANNEL_QUERY,
  type MySQL2TracingChannelFactory,
  subscribeMysql2DiagnosticChannels,
} from '../../src/mysql2/mysql2-dc-subscriber';

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
async function traceOperation(
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

const factory = tracingChannel as MySQL2TracingChannelFactory;

describe('subscribeMysql2DiagnosticChannels', () => {
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  // The subscriber captures the async-context strategy's ALS when it binds, so the strategy must be
  // installed before we subscribe — and both must stay fixed for the file. We do that once here,
  // mirroring production where `setupOnce` subscribes a single time. Per-test we only reset the client
  // and scopes (cleared in `afterEach`), so nothing leaks between tests.
  beforeAll(() => {
    installTestAsyncContextStrategy();
    subscribeMysql2DiagnosticChannels(factory);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    initTestClient();
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
  });

  afterEach(() => {
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  describe('query channel', () => {
    it('creates a db span with stable semconv attributes', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_QUERY,
        {
          query: 'SELECT solution FROM maths',
          database: 'test',
          serverAddress: '127.0.0.1',
          serverPort: 3306,
        },
        { result: [{ solution: 2 }] },
      );

      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('SELECT solution FROM maths');
      expect(json.op).toBe('db');
      expect(json.origin).toBe('auto.db.mysql2.diagnostic_channel');
      expect(json.data['db.system.name']).toBe('mysql');
      expect(json.data['db.operation.name']).toBe('SELECT');
      expect(json.data['db.namespace']).toBe('test');
      expect(json.data['server.address']).toBe('127.0.0.1');
      expect(json.data['server.port']).toBe(3306);
      expect(json.timestamp).toBeDefined();
    });

    it('sanitizes inlined values out of db.query.text and the span name', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_QUERY,
        // The `query` channel publishes the already-formatted SQL with values inlined.
        { query: "SELECT * FROM users WHERE email = 'a@b.com' AND age = 21" },
        { result: [] },
      );

      const json = spanToJSON(span!);
      const queryText = json.data['db.query.text'] as string;
      expect(queryText).toBe('SELECT * FROM users WHERE email = ? AND age = ?');
      expect(queryText).not.toContain('a@b.com');
      expect(queryText).not.toContain('21');
      // the span name is the sanitized statement too — no raw values leak there either
      expect(json.description).toBe('SELECT * FROM users WHERE email = ? AND age = ?');
    });

    it('does not attach raw values to the span', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_QUERY,
        { query: 'SELECT * FROM users WHERE id = ?', values: ['secret'] },
        { result: [] },
      );

      expect(JSON.stringify(spanToJSON(span!).data)).not.toContain('secret');
    });

    it('sets error status and does NOT capture an exception on failure', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_QUERY,
        { query: 'SELECT * FROM does_not_exist' },
        { error: new Error('table missing') },
      );

      expect(spanToJSON(span!).status).toBe('table missing');
      expect(spanToJSON(span!).timestamp).toBeDefined();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('parents the mysql2 span to the surrounding span and parents children to it', async () => {
      let outerSpanId: string | undefined;
      let result: Awaited<ReturnType<typeof traceOperation>> | undefined;

      await startSpan({ name: 'outer' }, async outer => {
        outerSpanId = outer.spanContext().spanId;
        result = await traceOperation(MYSQL2_DC_CHANNEL_QUERY, { query: 'SELECT 1' }, { result: [] });
      });

      expect(spanToJSON(result!.span!).parent_span_id).toBe(outerSpanId);
      expect(result!.childParentSpanId).toBe(result!.span!.spanContext().spanId);
    });
  });

  describe('execute channel', () => {
    it('keeps `?` placeholders in db.query.text (prepared statements)', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_EXECUTE,
        { query: 'SELECT * FROM users WHERE id = ?', values: [1] },
        { result: [] },
      );

      const json = spanToJSON(span!);
      expect(json.data['db.query.text']).toBe('SELECT * FROM users WHERE id = ?');
      expect(json.data['db.operation.name']).toBe('SELECT');
    });
  });

  describe('connect channels', () => {
    it('creates a connect span without db.query.text', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_CONNECT,
        { database: 'test', serverAddress: '127.0.0.1', serverPort: 3306, user: 'root' },
        { result: undefined },
      );

      const json = spanToJSON(span!);
      expect(json.description).toBe('mysql2.connect');
      expect(json.op).toBe('db');
      expect(json.origin).toBe('auto.db.mysql2.diagnostic_channel');
      expect(json.data['db.system.name']).toBe('mysql');
      expect(json.data['db.namespace']).toBe('test');
      expect(json.data['server.address']).toBe('127.0.0.1');
      expect(json.data['server.port']).toBe(3306);
      expect(json.data['db.query.text']).toBeUndefined();
    });

    it('names the pool connect span distinctly', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_POOL_CONNECT,
        { database: 'test', serverAddress: '127.0.0.1', serverPort: 3306 },
        { result: undefined },
      );

      expect(spanToJSON(span!).description).toBe('mysql2.pool.connect');
    });

    it('omits server.port for unix-socket connections', async () => {
      const { span } = await traceOperation(
        MYSQL2_DC_CHANNEL_CONNECT,
        { database: 'test', serverAddress: '/var/run/mysqld/mysqld.sock', serverPort: undefined },
        { result: undefined },
      );

      const json = spanToJSON(span!);
      expect(json.data['server.address']).toBe('/var/run/mysqld/mysqld.sock');
      expect(json.data['server.port']).toBeUndefined();
    });
  });

  describe('idempotency', () => {
    it('does not throw or double-subscribe on a second call', async () => {
      subscribeMysql2DiagnosticChannels(factory);

      const { span } = await traceOperation(MYSQL2_DC_CHANNEL_QUERY, { query: 'SELECT 1' }, { result: [] });

      // a single subscription means a single span, ended exactly once
      expect(span).toBeDefined();
      expect(spanToJSON(span!).timestamp).toBeDefined();
    });
  });
});
