import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import {
  DB_NAMESPACE,
  DB_OPERATION_BATCH_SIZE,
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
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { neonIntegration } from '../../src/integrations/neon';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// Same minimal async-context strategy as the pg tests: `bindTracingChannelToSpan` only binds
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

const CONNECTION = { database: 'neondb', host: 'ep-x.aws.neon.tech', port: 5432, user: 'tim' };

// Shape of `@neondatabase/serverless`'s `SqlTemplate`, the query data a tagged-template call builds.
function sqlTemplate(strings: string[], values: unknown[]): unknown {
  return {
    strings,
    values,
    toParameterizedQuery() {
      return { query: strings.reduce((acc, s, i) => `${acc}$${i}${s}`), params: values };
    },
  };
}

describe('neonIntegration', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@neondatabase/serverless'] };
    neonIntegration().setup?.({ on: () => () => undefined } as unknown as Client);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    getActiveSpanSpy = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('websocket driver (`Client.prototype.query`)', () => {
    it('builds a db span with the pg connection attributes and the neon origin', async () => {
      const ctx: ChannelContext = { arguments: ['SELECT * FROM "User"'], self: { connectionParameters: CONNECTION } };

      await tracingChannel(CHANNELS.NEON_QUERY).tracePromise(async () => ({ rows: [] }), ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SELECT * FROM "User"',
          attributes: expect.objectContaining({
            [SENTRY_OP]: DB,
            [SENTRY_KIND]: 'client',
            [DB_SYSTEM_NAME]: 'postgresql',
            [DB_NAMESPACE]: 'neondb',
            [DB_USER]: 'tim',
            [SERVER_ADDRESS]: 'ep-x.aws.neon.tech',
            [SERVER_PORT]: 5432,
            [DB_QUERY_TEXT]: 'SELECT * FROM "User"',
            [SENTRY_ORIGIN]: 'auto.db.neon',
          }),
        }),
      );
      // The deprecated `db.connection_string` is left to the pg integration.
      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.not.objectContaining({ 'db.connection_string': expect.anything() }),
        }),
      );
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('does not start a span without a parent span', async () => {
      getActiveSpanSpy.mockReturnValue(undefined);
      const ctx: ChannelContext = { arguments: ['SELECT 1'], self: { connectionParameters: CONNECTION } };

      await tracingChannel(CHANNELS.NEON_QUERY).tracePromise(async () => ({ rows: [] }), ctx);

      expect(startInactiveSpanSpy).not.toHaveBeenCalled();
    });
  });

  describe('http driver (`neon()`)', () => {
    it('builds a db span for `sql.query(text, params)`', async () => {
      const ctx: ChannelContext = {
        arguments: [{ query: 'SELECT * FROM "User" WHERE id = $1', params: [1] }, undefined],
      };

      await tracingChannel(CHANNELS.NEON_HTTP_QUERY).tracePromise(async () => [], ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SELECT "User"',
          attributes: expect.objectContaining({
            [SENTRY_OP]: DB,
            [SENTRY_KIND]: 'client',
            [DB_SYSTEM_NAME]: 'postgresql',
            [DB_QUERY_TEXT]: 'SELECT * FROM "User" WHERE id = $1',
            [DB_QUERY_SUMMARY]: 'SELECT "User"',
            [SENTRY_ORIGIN]: 'auto.db.neon',
            [DB_OPERATION_BATCH_SIZE]: undefined,
          }),
        }),
      );
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('renders a tagged-template query with positional placeholders', async () => {
      const ctx: ChannelContext = {
        arguments: [sqlTemplate(['SELECT * FROM "User" WHERE id = ', ' AND name = ', ''], [1, 'tim'])],
      };

      await tracingChannel(CHANNELS.NEON_HTTP_QUERY).tracePromise(async () => [], ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SELECT "User"',
          attributes: expect.objectContaining({
            [DB_QUERY_TEXT]: 'SELECT * FROM "User" WHERE id = $1 AND name = $2',
          }),
        }),
      );
    });

    it('builds one span for a `transaction()` batch with the batch size', async () => {
      const ctx: ChannelContext = {
        arguments: [
          [
            { query: 'INSERT INTO "User" ("name") VALUES ($1)', params: ['tim'] },
            sqlTemplate(['SELECT * FROM "User"'], []),
          ],
          [{}, {}],
        ],
      };

      await tracingChannel(CHANNELS.NEON_HTTP_QUERY).tracePromise(async () => [[], []], ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'INSERT "User"; SELECT "User"',
          attributes: expect.objectContaining({
            [DB_QUERY_TEXT]: 'INSERT INTO "User" ("name") VALUES ($1); SELECT * FROM "User"',
            [DB_QUERY_SUMMARY]: 'INSERT "User"; SELECT "User"',
            [DB_OPERATION_BATCH_SIZE]: 2,
            [SENTRY_ORIGIN]: 'auto.db.neon',
          }),
        }),
      );
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('sets error status and ends the span when the request rejects', async () => {
      const ctx: ChannelContext = { arguments: [{ query: 'SELECT 1', params: [] }] };

      await expect(
        tracingChannel(CHANNELS.NEON_HTTP_QUERY).tracePromise(async () => {
          throw new Error('boom');
        }, ctx),
      ).rejects.toThrow('boom');

      expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything(), message: 'boom' });
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('adds the connection attributes once the connection string resolves inside the query', async () => {
      const ctx: ChannelContext = { arguments: [{ query: 'SELECT 1', params: [] }] };

      await tracingChannel(CHANNELS.NEON_HTTP_QUERY).tracePromise(async () => {
        // The resolver runs inside the query span's async context.
        getActiveSpanSpy.mockReturnValue(span);
        await tracingChannel(CHANNELS.NEON_RESOLVE_CONNECTION).tracePromise(
          async () => ({
            resolvedConnectionString: 'postgresql://tim:secret@ep-x.aws.neon.tech/neondb?application_name=x',
            resolvedURL: new URL('postgresql://tim:secret@ep-x.aws.neon.tech/neondb?application_name=x'),
          }),
          { arguments: ['postgresql://tim:secret@ep-x.aws.neon.tech/neondb'] },
        );
      }, ctx);

      // No port in the URL means the Postgres default, like pg's own connection parameters.
      expect(span.setAttributes).toHaveBeenCalledWith({
        [DB_SYSTEM_NAME]: 'postgresql',
        [DB_NAMESPACE]: 'neondb',
        [DB_USER]: 'tim',
        [SERVER_ADDRESS]: 'ep-x.aws.neon.tech',
        [SERVER_PORT]: 5432,
      });
    });

    it('leaves spans it did not start alone when the connection string resolves', async () => {
      const foreignSpan = makeSpan();
      getActiveSpanSpy.mockReturnValue(foreignSpan);

      await tracingChannel(CHANNELS.NEON_RESOLVE_CONNECTION).tracePromise(
        async () => ({ resolvedURL: new URL('postgresql://tim:secret@ep-x.aws.neon.tech/neondb') }),
        { arguments: [] },
      );

      expect(foreignSpan.setAttributes).not.toHaveBeenCalled();
    });
  });
});
