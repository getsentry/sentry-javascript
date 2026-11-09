import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  DB_USER,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { DB } from '@sentry/conventions/op';
import type { Client, Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  GLOBAL_OBJ,
  setAsyncContextStrategy,
  SPAN_STATUS_ERROR,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { clickhouseIntegration } from '../../src/integrations/clickhouse';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// Same minimal async-context strategy as the pg and neon tests: `bindTracingChannelToSpan` only binds
// when a `getTracingChannelBinding` exists.
function installTestAsyncContextStrategy(): void {
  const asyncStorage = new AsyncLocalStorage<TestStore>();

  function getScopes(): TestStore {
    return asyncStorage.getStore() || { scope: getDefaultCurrentScope(), isolationScope: getDefaultIsolationScope() };
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

function makeSpan(): Span {
  return { end: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() } as unknown as Span;
}

interface ChannelContext {
  arguments: unknown[];
  self?: unknown;
  result?: unknown;
}

// `ClickHouseClient` as `>=1.10` builds it: the username sits in `auth`.
const CLIENT = {
  connectionParams: {
    url: new URL('http://clickhouse.internal:8123'),
    database: 'analytics',
    auth: { username: 'reporter', password: 'secret', type: 'Credentials' },
  },
};

const CONNECTION_ATTRIBUTES = {
  [SENTRY_OP]: DB,
  [SENTRY_KIND]: 'client',
  [SENTRY_ORIGIN]: 'auto.db.clickhouse',
  [DB_SYSTEM_NAME]: 'clickhouse',
  [DB_NAMESPACE]: 'analytics',
  [DB_USER]: 'reporter',
  [SERVER_ADDRESS]: 'clickhouse.internal',
  [SERVER_PORT]: 8123,
};

describe('clickhouseIntegration', () => {
  let startInactiveSpanSpy: MockInstance;
  let captureExceptionSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@clickhouse/client', '@clickhouse/client-common'] };
    clickhouseIntegration().setup?.({ on: () => () => undefined } as unknown as Client);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['query', CHANNELS.CLICKHOUSE_QUERY],
    ['command', CHANNELS.CLICKHOUSE_COMMAND],
    ['exec', CHANNELS.CLICKHOUSE_EXEC],
  ])('builds a db span for `%s` from the sanitized statement', async (_method, channel) => {
    const ctx: ChannelContext = {
      arguments: [{ query: "SELECT count() FROM events WHERE name = 'signup' AND id > 42" }],
      self: CLIENT,
    };

    await tracingChannel(channel).tracePromise(async () => ({}), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith({
      name: 'SELECT events',
      onlyIfParent: true,
      attributes: expect.objectContaining({
        ...CONNECTION_ATTRIBUTES,
        [DB_QUERY_TEXT]: 'SELECT count() FROM events WHERE name = ? AND id > ?',
        [DB_QUERY_SUMMARY]: 'SELECT events',
        [DB_OPERATION_NAME]: 'SELECT',
      }),
    });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('builds a db span for `insert` from the target table', async () => {
    const ctx: ChannelContext = {
      arguments: [{ table: 'events', values: [{ id: 1, name: 'signup' }], format: 'JSONEachRow' }],
      self: CLIENT,
    };

    await tracingChannel(CHANNELS.CLICKHOUSE_INSERT).tracePromise(async () => ({ executed: true }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith({
      name: 'INSERT events',
      onlyIfParent: true,
      attributes: expect.objectContaining({
        ...CONNECTION_ATTRIBUTES,
        [DB_OPERATION_NAME]: 'INSERT',
        [DB_COLLECTION_NAME]: 'events',
        [DB_QUERY_SUMMARY]: 'INSERT events',
      }),
    });
    // The inserted values never reach the span.
    expect(startInactiveSpanSpy.mock.calls[0]?.[0].attributes[DB_QUERY_TEXT]).toBeUndefined();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('skips `insert` with an empty array, which sends no request', async () => {
    const ctx: ChannelContext = { arguments: [{ table: 'events', values: [] }], self: CLIENT };

    await tracingChannel(CHANNELS.CLICKHOUSE_INSERT).tracePromise(async () => ({ executed: false }), ctx);

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  it('sets an error status on a failed call without capturing the error', async () => {
    const ctx: ChannelContext = { arguments: [{ query: 'SELECT * FROM does_not_exist' }], self: CLIENT };

    await expect(
      tracingChannel(CHANNELS.CLICKHOUSE_QUERY).tracePromise(async () => {
        throw new Error('Table analytics.does_not_exist does not exist');
      }, ctx),
    ).rejects.toThrow('Table analytics.does_not_exist does not exist');

    expect(span.setStatus).toHaveBeenCalledWith({
      code: SPAN_STATUS_ERROR,
      message: 'Table analytics.does_not_exist does not exist',
    });
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['query', CHANNELS.CLICKHOUSE_COMMON_QUERY],
    ['command', CHANNELS.CLICKHOUSE_COMMON_COMMAND],
    ['exec', CHANNELS.CLICKHOUSE_COMMON_EXEC],
    ['insert', CHANNELS.CLICKHOUSE_COMMON_INSERT],
  ])('builds a db span for `%s` from `@clickhouse/client-common`', async (_method, channel) => {
    const ctx: ChannelContext = { arguments: [{ query: 'SELECT 1', table: 'events', values: [1] }], self: CLIENT };

    await tracingChannel(channel).tracePromise(async () => ({}), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining(CONNECTION_ATTRIBUTES) }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('reads the username from older clients and the default port from the protocol', async () => {
    const ctx: ChannelContext = {
      arguments: [{ query: 'SELECT 1' }],
      // `<1.10` keeps `username` at the top level of `connectionParams`.
      self: { connectionParams: { url: new URL('https://ch.example.com'), database: 'default', username: 'default' } },
    };

    await tracingChannel(CHANNELS.CLICKHOUSE_COMMON_QUERY).tracePromise(async () => ({}), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_USER]: 'default',
          [SERVER_ADDRESS]: 'ch.example.com',
          [SERVER_PORT]: 443,
        }),
      }),
    );
  });

  it('prefers a per-call `auth` override for the username', async () => {
    const ctx: ChannelContext = {
      arguments: [{ query: 'SELECT 1', auth: { username: 'writer', password: 'secret' } }],
      self: CLIENT,
    };

    await tracingChannel(CHANNELS.CLICKHOUSE_QUERY).tracePromise(async () => ({}), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ [DB_USER]: 'writer' }) }),
    );
  });
});
