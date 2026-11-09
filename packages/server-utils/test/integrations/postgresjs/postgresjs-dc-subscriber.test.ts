import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_RESPONSE_STATUS_CODE,
  DB_SYSTEM_NAME,
  ERROR_TYPE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_STATUS_MESSAGE,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  addNonEnumerableProperty,
  Client,
  createTransport,
  getActiveSpan,
  getAsyncContextStrategy,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getMainCarrier,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPostgresJsConnectionContext,
  getPostgresJsQueryEndAttributes,
  POSTGRESJS_DC_CHANNEL_QUERY,
  type PostgresJsQueryData,
  type PostgresJsTracingChannelFactory,
  subscribePostgresJsDiagnosticChannels,
} from '../../../src/integrations/postgresjs/postgresjs-dc-subscriber';

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
  getCurrentScope().setClient(undefined);
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    traceLifecycle: 'static',
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

/**
 * Publishes a query the way postgres v4 does (`src/diagnostics.js`): `start` around the dispatch,
 * then the connection fields are filled in, then `error`/`asyncStart`/`asyncEnd` on completion.
 */
function publishQuery(
  context: PostgresJsQueryData,
  outcome: { sent?: Partial<PostgresJsQueryData>; result?: unknown; error?: unknown },
): Span | undefined {
  const channel = tracingChannel<object, PostgresJsQueryData>(POSTGRESJS_DC_CHANNEL_QUERY);
  let activeSpan: Span | undefined;

  channel.start.runStores(context, () => {
    activeSpan = getActiveSpan();
    channel.end.publish(context);
  });

  Object.assign(context, outcome.sent);

  if (outcome.error) {
    context.error = outcome.error;
    channel.error.publish(context);
  } else {
    context.result = outcome.result;
  }
  channel.asyncStart.publish(context);
  channel.asyncEnd.publish(context);

  return activeSpan;
}

function newContext(query: string | null): PostgresJsQueryData {
  return {
    query,
    database: 'test_db',
    user: 'test',
    host: null,
    port: null,
    command: null,
  };
}

const requestHook = vi.fn();

describe('postgresjs diagnostics-channel subscriber', () => {
  describe('getPostgresJsConnectionContext', () => {
    it('only has the database before the query is sent', () => {
      expect(getPostgresJsConnectionContext(newContext('SELECT 1'))).toEqual({
        ATTR_DB_NAMESPACE: 'test_db',
        ATTR_SERVER_ADDRESS: undefined,
        ATTR_SERVER_PORT: undefined,
      });
    });

    it('has the host and port once the query is sent', () => {
      expect(getPostgresJsConnectionContext({ ...newContext('SELECT 1'), host: 'localhost', port: 5444 })).toEqual({
        ATTR_DB_NAMESPACE: 'test_db',
        ATTR_SERVER_ADDRESS: 'localhost',
        ATTR_SERVER_PORT: '5444',
      });
    });

    it('drops an empty database', () => {
      expect(getPostgresJsConnectionContext({ ...newContext('SELECT 1'), database: '' }).ATTR_DB_NAMESPACE).toBe(
        undefined,
      );
    });
  });

  describe('getPostgresJsQueryEndAttributes', () => {
    it('maps the connection and the server-reported command', () => {
      expect(
        getPostgresJsQueryEndAttributes({
          ...newContext('SELECT 1'),
          host: 'localhost',
          port: 5444,
          command: 'SELECT',
          result: [],
        }),
      ).toEqual({
        [DB_NAMESPACE]: 'test_db',
        [SERVER_ADDRESS]: 'localhost',
        [SERVER_PORT]: 5444,
        [DB_OPERATION_NAME]: 'SELECT',
      });
    });

    it('maps the Postgres error code', () => {
      expect(
        getPostgresJsQueryEndAttributes({
          ...newContext('SELECT 1'),
          error: Object.assign(new Error('relation "User" does not exist'), { code: '42P01' }),
        }),
      ).toEqual({ [DB_NAMESPACE]: 'test_db', [DB_RESPONSE_STATUS_CODE]: '42P01' });
    });

    it('falls back to `unknown` when the error has no code', () => {
      expect(
        getPostgresJsQueryEndAttributes({ ...newContext('SELECT 1'), error: new Error('boom') })[
          DB_RESPONSE_STATUS_CODE
        ],
      ).toBe('unknown');
    });
  });

  describe('subscribePostgresJsDiagnosticChannels', () => {
    beforeAll(() => {
      installTestAsyncContextStrategy();
      subscribePostgresJsDiagnosticChannels(tracingChannel as PostgresJsTracingChannelFactory, { requestHook });
    });

    afterAll(() => {
      setAsyncContextStrategy(undefined);
    });

    beforeEach(() => {
      initTestClient();
    });

    afterEach(() => {
      const acs = getAsyncContextStrategy(getMainCarrier());
      getMainCarrier().__SENTRY__ = undefined;
      setAsyncContextStrategy(acs);
      vi.clearAllMocks();
    });

    it('creates a db span parented to the caller and enriched on completion', () => {
      let parentSpanId: string | undefined;
      let span: Span | undefined;

      startSpan({ name: 'parent' }, parent => {
        parentSpanId = parent.spanContext().spanId;
        span = publishQuery(newContext('SELECT * FROM "User" WHERE "email" = $1 AND "name" = \'tim\''), {
          sent: { host: 'localhost', port: 5444, command: 'SELECT' },
          result: [],
        });
      });

      expect(spanToJSON(span!)).toEqual(
        expect.objectContaining({
          name: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = ?',
          parent_span_id: parentSpanId,
          status: 'ok',
          attributes: expect.objectContaining({
            [SENTRY_ORIGIN]: 'auto.db.postgresjs',
            [SENTRY_OP]: DB,
            [DB_SYSTEM_NAME]: 'postgres',
            [DB_QUERY_TEXT]: 'SELECT * FROM "User" WHERE "email" = $1 AND "name" = ?',
            [DB_OPERATION_NAME]: 'SELECT',
            [DB_NAMESPACE]: 'test_db',
            [SERVER_ADDRESS]: 'localhost',
            [SERVER_PORT]: 5444,
          }),
          end_timestamp: expect.any(Number),
        }),
      );
    });

    it('marks a failed query as errored', () => {
      let span: Span | undefined;

      startSpan({ name: 'parent' }, () => {
        span = publishQuery(newContext('SELECT * FROM "User"'), {
          sent: { host: 'localhost', port: 5444 },
          error: Object.assign(new Error('relation "User" does not exist'), { name: 'PostgresError', code: '42P01' }),
        });
      });

      expect(spanToJSON(span!)).toEqual(
        expect.objectContaining({
          status: 'error',
          attributes: expect.objectContaining({
            [SENTRY_STATUS_MESSAGE]: 'relation "User" does not exist',
            [DB_RESPONSE_STATUS_CODE]: '42P01',
            [ERROR_TYPE]: 'PostgresError',
          }),
          end_timestamp: expect.any(Number),
        }),
      );
    });

    it('calls requestHook with the context known at start', () => {
      startSpan({ name: 'parent' }, () => {
        publishQuery(newContext('DROP TABLE "User"'), { sent: { host: 'localhost', port: 5444 }, result: [] });
      });

      expect(requestHook).toHaveBeenCalledWith(expect.anything(), 'DROP TABLE "User"', {
        ATTR_DB_NAMESPACE: 'test_db',
        ATTR_SERVER_ADDRESS: undefined,
        ATTR_SERVER_PORT: undefined,
      });
    });

    it('does not create a span without a parent', () => {
      const span = publishQuery(newContext('SELECT 1'), { result: [] });

      expect(span?.isRecording()).toBe(false);
    });

    it('skips queries already spanned by instrumentPostgresJsSql', () => {
      startSpan({ name: 'wrapper' }, wrapperSpan => {
        addNonEnumerableProperty(wrapperSpan, Symbol.for('sentry.postgresjs.wrapper.span'), true);
        const span = publishQuery(newContext('SELECT 1'), { result: [] });

        expect(span).toBe(wrapperSpan);
        expect(requestHook).not.toHaveBeenCalled();
      });
    });
  });
});
