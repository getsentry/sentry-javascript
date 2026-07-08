import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { postgresChannelIntegration } from '../../src/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds (and `setupOnce` only subscribes via
// `waitForTracingChannelBinding`) when an async-context strategy exposes a
// `getTracingChannelBinding`. Install a minimal one so the channel
// subscriptions actually register in this unit-test context (no SDK `init`).
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

// The subscriber builds spans via `startInactiveSpan` and gates on
// `getActiveSpan`. We spy both: `getActiveSpan` to satisfy the
// requireParentSpan gate, and `startInactiveSpan` to capture the span
// options the subscriber builds (name + raw attributes) and to track the
// span's lifecycle. The final `op: 'db'` / SQL description come from the
// SDK's `inferDbSpanData` processor, which isn't wired up here. That's
// covered by the integration test.
function makeSpan(): Span {
  return { end: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() } as unknown as Span;
}

interface ChannelContext {
  arguments: unknown[];
  self?: unknown;
}

describe('postgresChannelIntegration', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  // Subscribe once for the whole file so a single subscriber handles each
  // publish (avoids accumulating duplicate subscriptions across tests). The
  // strategy must be installed first so `setupOnce`'s `waitForTracingChannelBinding` fires synchronously.
  beforeAll(() => {
    installTestAsyncContextStrategy();
    postgresChannelIntegration().setupOnce?.();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    // A truthy active span by default, so the requireParentSpan gate passes.
    getActiveSpanSpy = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const CONNECTION = { database: 'tests', host: 'localhost', port: 5432, user: 'tim' };

  it('query: builds a `pg.query` span with db attributes and the orchestrion origin', async () => {
    const ctx: ChannelContext = { arguments: ['SELECT * FROM "User"'], self: { connectionParameters: CONNECTION } };

    await tracingChannel(CHANNELS.PG_QUERY).tracePromise(async () => ({ rows: [] }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SELECT * FROM "User"',
        op: 'db',
        attributes: expect.objectContaining({
          'db.system': 'postgresql',
          'db.name': 'tests',
          'db.user': 'tim',
          'net.peer.name': 'localhost',
          'net.peer.port': 5432,
          'db.connection_string': 'postgresql://localhost:5432/tests',
          'db.statement': 'SELECT * FROM "User"',
          'sentry.origin': 'auto.db.orchestrion.postgres',
        }),
      }),
    );
    // Ended on `asyncEnd` (the full promise round-trip).
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('query: records the prepared-statement name as `db.postgresql.plan`', async () => {
    const ctx: ChannelContext = {
      arguments: [{ name: 'select-user-by-email', text: 'SELECT * FROM "User" WHERE "email" = $1', values: ['x'] }],
      self: { connectionParameters: CONNECTION },
    };

    await tracingChannel(CHANNELS.PG_QUERY).tracePromise(async () => ({ rows: [] }), ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SELECT * FROM "User" WHERE "email" = $1',
        op: 'db',
        attributes: expect.objectContaining({
          'db.statement': 'SELECT * FROM "User" WHERE "email" = $1',
          'db.postgresql.plan': 'select-user-by-email',
          'sentry.origin': 'auto.db.orchestrion.postgres',
        }),
      }),
    );
  });

  it('query: sets error status and ends the span when the query rejects', async () => {
    const ctx: ChannelContext = { arguments: ['SELECT 1'], self: { connectionParameters: CONNECTION } };

    await expect(
      tracingChannel(CHANNELS.PG_QUERY).tracePromise(async () => {
        throw new Error('boom');
      }, ctx),
    ).rejects.toThrow('boom');

    expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything(), message: 'boom' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('connect: builds a `pg.connect` span with no origin (defaults to manual)', async () => {
    const ctx: ChannelContext = { arguments: [], self: { connectionParameters: CONNECTION } };

    await tracingChannel(CHANNELS.PG_CONNECT).tracePromise(async () => undefined, ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pg.connect',
        op: 'db',
        attributes: expect.objectContaining({ 'db.system': 'postgresql', 'db.name': 'tests' }),
      }),
    );
    // Connect spans must NOT set an origin (so they default to 'manual').
    const options = startInactiveSpanSpy.mock.calls[0]![0] as { attributes: Record<string, unknown> };
    expect(options.attributes['sentry.origin']).toBeUndefined();
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('pool connect: builds a `pg-pool.connect` span with masked connection string + pool attributes', async () => {
    const ctx: ChannelContext = {
      arguments: [],
      self: {
        options: {
          connectionString: 'postgresql://user:secret@localhost:5494/tests',
          idleTimeoutMillis: 10_000,
          // pg-pool exposes the max pool size as `max` (not `maxClient`).
          max: 10,
        },
      },
    };

    await tracingChannel(CHANNELS.PGPOOL_CONNECT).tracePromise(async () => undefined, ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'pg-pool.connect',
        op: 'db',
        attributes: expect.objectContaining({
          'db.system': 'postgresql',
          'db.name': 'tests',
          'db.user': 'user',
          'net.peer.name': 'localhost',
          'net.peer.port': 5494,
          // Credentials masked out of the connection string.
          'db.connection_string': 'postgresql://localhost:5494/tests',
          'db.postgresql.idle.timeout.millis': 10_000,
          'db.postgresql.max.client': 10,
        }),
      }),
    );
    const options = startInactiveSpanSpy.mock.calls[0]![0] as { attributes: Record<string, unknown> };
    expect(options.attributes['sentry.origin']).toBeUndefined();
  });

  it('pool connect: falls back to the explicit `port` when the connection string omits it (OTel parity)', async () => {
    const ctx: ChannelContext = {
      arguments: [],
      self: {
        options: {
          // No port in the connection string, but one is configured explicitly.
          connectionString: 'postgresql://user:secret@localhost/tests',
          port: 5433,
        },
      },
    };

    await tracingChannel(CHANNELS.PGPOOL_CONNECT).tracePromise(async () => undefined, ctx);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'net.peer.name': 'localhost',
          'net.peer.port': 5433,
        }),
      }),
    );
  });

  it('requireParentSpan: does not create a span when there is no active span', async () => {
    getActiveSpanSpy.mockReturnValue(undefined);
    const ctx: ChannelContext = { arguments: ['SELECT 1'], self: { connectionParameters: CONNECTION } };

    await tracingChannel(CHANNELS.PG_QUERY).tracePromise(async () => ({ rows: [] }), ctx);

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });
});
