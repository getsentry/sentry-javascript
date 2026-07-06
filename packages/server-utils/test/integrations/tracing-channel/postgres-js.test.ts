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
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { postgresJsChannelIntegration } from '../../../src/integrations/tracing-channel/postgres-js';
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

/** A minimal stand-in for a postgres.js `Query`: what `Query.prototype.handle` sees as `self`. */
interface FakeQuery {
  strings?: string[];
  executed?: boolean;
  resolve: (...args: unknown[]) => unknown;
  reject: (...args: unknown[]) => unknown;
  [key: symbol]: unknown;
}

function makeQuery(strings: string[] | undefined, extra: Partial<FakeQuery> = {}): FakeQuery {
  return {
    strings,
    executed: false,
    resolve: vi.fn(),
    reject: vi.fn(),
    ...extra,
  };
}

const endedSpans: Span[] = [];
let requestHookSpy: ReturnType<typeof vi.fn> | undefined;

/**
 * Drive `Query.prototype.handle` through its tracing channel, mirroring how
 * postgres.js dispatches: `handle()` (async) returns immediately, so the span is
 * still open when the promise settles. The caller ends it by invoking
 * `query.resolve`/`query.reject` afterwards (as postgres.js does on completion).
 */
async function driveHandle(query: FakeQuery, { withParent = true }: { withParent?: boolean } = {}): Promise<void> {
  const drive = async (): Promise<void> => {
    await tracingChannel(CHANNELS.POSTGRESJS_HANDLE).tracePromise(async () => {}, { arguments: [], self: query });
  };

  if (withParent) {
    await startSpan({ name: 'parent' }, drive);
  } else {
    await drive();
  }
}

function publishConnection(connection: object, options: Record<string, unknown>): void {
  tracingChannel(CHANNELS.POSTGRESJS_CONNECTION).traceSync(() => connection, { arguments: [options] });
}

function publishExecute(connection: object, query: FakeQuery): void {
  tracingChannel(CHANNELS.POSTGRESJS_EXECUTE).traceSync(() => undefined, { self: connection, arguments: [query] });
}

function lastPgSpan(): Span | undefined {
  return endedSpans.filter(s => spanToJSON(s).data['sentry.origin'] === 'auto.db.orchestrion.postgresjs').at(-1);
}

describe('postgresJsChannelIntegration', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    const integration = postgresJsChannelIntegration({ requestHook: (...args) => requestHookSpy?.(...args) });
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
    requestHookSpy = vi.fn();
  });

  // These run with an empty endpoint registry (no `connection` channel driven
  // yet), so query spans carry no connection attributes here — those are
  // covered in the "connection context" block below.
  describe('query span (handle channel)', () => {
    it('creates a db span with the NEW semconv shape and orchestrion origin', async () => {
      const query = makeQuery(['SELECT * FROM "User"']);
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      const span = lastPgSpan();
      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('SELECT * FROM "User"');
      expect(json.op).toBe('db');
      // A successful core span leaves the status unset (the OTel pipeline maps it to 'ok').
      expect(json.status).toBeUndefined();
      expect(json.data['sentry.origin']).toBe('auto.db.orchestrion.postgresjs');
      expect(json.data['db.system.name']).toBe('postgres');
      expect(json.data['db.query.text']).toBe('SELECT * FROM "User"');
      expect(json.data['db.operation.name']).toBe('SELECT');
    });

    it('reconstructs $n placeholders from tagged-template strings', async () => {
      const query = makeQuery(['SELECT * FROM users WHERE id = ', ' AND name = ', '']);
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      const json = spanToJSON(lastPgSpan()!);
      expect(json.description).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
      expect(json.data['db.query.text']).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
    });

    it('sets error status and error attributes when the query rejects', async () => {
      const query = makeQuery(['SELECT * FROM "Missing"']);
      await driveHandle(query);
      query.reject({ message: 'relation "Missing" does not exist', code: '42P01', name: 'PostgresError' });

      const json = spanToJSON(lastPgSpan()!);
      expect(json.status).toBe('relation "Missing" does not exist');
      expect(json.data['db.response.status_code']).toBe('42P01');
      expect(json.data['error.type']).toBe('PostgresError');
      // Falls back to the leading SQL keyword when the rejection carries no command.
      expect(json.data['db.operation.name']).toBe('SELECT');
    });

    it('does not create a span for re-entrant handle() calls (then/catch/finally)', async () => {
      const query = makeQuery(['SELECT 1'], { executed: true });
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      expect(lastPgSpan()).toBeUndefined();
    });

    it('does not create a span for queries already wrapped by instrumentPostgresJsSql', async () => {
      const query = makeQuery(['SELECT 1'], {
        [Symbol.for('sentry.query.from.instrumented.sql')]: true,
      });
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      expect(lastPgSpan()).toBeUndefined();
    });

    it('does not create a span without an active parent span by default', async () => {
      const query = makeQuery(['SELECT 1']);
      await driveHandle(query, { withParent: false });
      query.resolve({ command: 'SELECT' });

      expect(lastPgSpan()).toBeUndefined();
    });

    it('runs requestHook with the span and sanitized query', async () => {
      const query = makeQuery(['SELECT ', '']);
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      const span = lastPgSpan();
      expect(requestHookSpy).toHaveBeenCalledTimes(1);
      // No connection context yet (empty registry), so the third arg is undefined here.
      expect(requestHookSpy).toHaveBeenCalledWith(span, 'SELECT $1', undefined);
    });
  });

  // NOTE: these tests are order-dependent. The endpoint registry only grows
  // (it models connections discovered over the process lifetime), so the
  // single-endpoint case must run before the two-endpoint case adds a second.
  describe('connection context', () => {
    const connectionX = { id: 'x' };
    const optionsX = { host: ['localhost'], port: [5444], database: 'test_db' };
    const connectionY = { id: 'y' };
    const optionsY = { host: ['localhost'], port: [5455], database: 'other_db' };

    it('with one known endpoint, attaches connection attrs at handle-start and passes context to requestHook', async () => {
      publishConnection(connectionX, optionsX);

      const query = makeQuery(['SELECT 1']);
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      const json = spanToJSON(lastPgSpan()!);
      expect(json.data['server.address']).toBe('localhost');
      expect(json.data['server.port']).toBe(5444);
      expect(json.data['db.namespace']).toBe('test_db');

      expect(requestHookSpy).toHaveBeenCalledWith(expect.anything(), 'SELECT ?', {
        ATTR_DB_NAMESPACE: 'test_db',
        ATTR_SERVER_ADDRESS: 'localhost',
        ATTR_SERVER_PORT: '5444',
      });
    });

    it('with multiple known endpoints, does not attach connection attrs at handle-start', async () => {
      publishConnection(connectionY, optionsY);

      const query = makeQuery(['SELECT 1']);
      await driveHandle(query);
      query.resolve({ command: 'SELECT' });

      const json = spanToJSON(lastPgSpan()!);
      expect(json.data['server.address']).toBeUndefined();
      expect(json.data['server.port']).toBeUndefined();
      expect(json.data['db.namespace']).toBeUndefined();
      expect(requestHookSpy).toHaveBeenCalledWith(expect.anything(), 'SELECT ?', undefined);
    });

    it('attaches per-connection attrs via the execute channel when the fallback cannot resolve them', async () => {
      // Registry has two endpoints, so handle-start leaves the span without attrs;
      // the execute channel resolves them from the connection object.
      const query = makeQuery(['SELECT 1']);
      await driveHandle(query);
      publishExecute(connectionX, query);
      query.resolve({ command: 'SELECT' });

      const json = spanToJSON(lastPgSpan()!);
      expect(json.data['server.address']).toBe('localhost');
      expect(json.data['server.port']).toBe(5444);
      expect(json.data['db.namespace']).toBe('test_db');
    });
  });

  // Own integration instance so `requireParentSpan: false` is exercised in
  // isolation. Its handle producer replaces the default one on the shared
  // channel, so this block runs last and only drives unparented queries.
  describe('requireParentSpan: false', () => {
    beforeAll(() => {
      const integration = postgresJsChannelIntegration({ requireParentSpan: false });
      integration.setupOnce?.();
    });

    it('creates a span even without an active parent span', async () => {
      const query = makeQuery(['SELECT 1']);
      await driveHandle(query, { withParent: false });
      query.resolve({ command: 'SELECT' });

      const span = lastPgSpan();
      expect(span).toBeDefined();
      expect(spanToJSON(span!).description).toBe('SELECT ?');
      expect(spanToJSON(span!).data['db.operation.name']).toBe('SELECT');
    });
  });
});
