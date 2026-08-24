import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getAsyncContextStrategy,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getMainCarrier,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  GRAPHQL_DC_CHANNEL_EXECUTE,
  GRAPHQL_DC_CHANNEL_PARSE,
  GRAPHQL_DC_CHANNEL_RESOLVE,
  GRAPHQL_DC_CHANNEL_SUBSCRIBE,
  GRAPHQL_DC_CHANNEL_VALIDATE,
  type GraphqlTracingChannelFactory,
  subscribeGraphqlDiagnosticChannels,
} from '../../../src/integrations/graphql/graphql-dc-subscriber';

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

function initTestClient(traceLifecycle: 'static' | 'stream'): void {
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    traceLifecycle,
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
 * Publishes one channel operation inside an enclosing span (the subscriber only creates a span when
 * one is active) and returns the name of the span it bound, plus the enclosing span's final name.
 */
async function traceOperation(
  channelName: string,
  data: Record<string, unknown>,
): Promise<{ spanName: string | undefined; enclosingSpanName: string | undefined }> {
  const channel = tracingChannel(channelName);
  let span: Span | undefined;
  let enclosingSpanName: string | undefined;

  await startSpan({ name: 'GET /graphql' }, async enclosing => {
    await channel.tracePromise(async () => {
      span = getActiveSpan();
    }, data);
    enclosingSpanName = spanToJSON(enclosing).name;
  });

  return { spanName: span && spanToJSON(span).name, enclosingSpanName };
}

const factory = tracingChannel as GraphqlTracingChannelFactory;

describe('subscribeGraphqlDiagnosticChannels', () => {
  // The subscriber captures the async-context strategy's ALS when it binds, so the strategy must be
  // installed before we subscribe, and both stay fixed for the file. Only the client changes per test.
  beforeAll(() => {
    installTestAsyncContextStrategy();
    subscribeGraphqlDiagnosticChannels(factory, { ignoreResolveSpans: false });
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  afterEach(() => {
    // Keep the async-context strategy the subscriber bound to in `beforeAll`; wiping it would strand
    // the ALS it captured, so no further spans would be created.
    const acs = getAsyncContextStrategy(getMainCarrier());
    getMainCarrier().__SENTRY__ = undefined;
    setAsyncContextStrategy(acs);
  });

  describe('with span streaming', () => {
    it.each([
      [GRAPHQL_DC_CHANNEL_PARSE, {}, 'GraphQL parse'],
      [GRAPHQL_DC_CHANNEL_VALIDATE, {}, 'GraphQL validate'],
      [
        GRAPHQL_DC_CHANNEL_RESOLVE,
        { fieldName: 'name', parentType: 'User', fieldType: 'String', fieldPath: 'user.0.name' },
        'GraphQL resolve',
      ],
    ])('names the %s span after the phase, dropping the field path', async (channel, data, expected) => {
      initTestClient('stream');

      const { spanName } = await traceOperation(channel, data);

      expect(spanName).toBe(expected);
    });

    it('names an operation span with the static fallback when no operation type is available', async () => {
      initTestClient('stream');

      const { spanName } = await traceOperation(GRAPHQL_DC_CHANNEL_EXECUTE, { operationName: 'GetUser' });

      expect(spanName).toBe('GraphQL Operation');
    });

    it.each([
      [GRAPHQL_DC_CHANNEL_EXECUTE, 'query', 'GraphQL query'],
      [GRAPHQL_DC_CHANNEL_EXECUTE, 'mutation', 'GraphQL mutation'],
      [GRAPHQL_DC_CHANNEL_SUBSCRIBE, 'subscription', 'GraphQL subscription'],
    ])('names a %s span after the operation type, dropping the operation name', async (channel, type, expected) => {
      initTestClient('stream');

      const { spanName } = await traceOperation(channel, { operationType: type, operationName: 'GetUser' });

      expect(spanName).toBe(expected);
    });

    it('records the operation on the root span without renaming it', async () => {
      initTestClient('stream');

      const { enclosingSpanName } = await traceOperation(GRAPHQL_DC_CHANNEL_EXECUTE, {
        operationType: 'query',
        operationName: 'GetUser',
      });

      expect(enclosingSpanName).toBe('GET /graphql');
    });
  });

  describe('without span streaming', () => {
    it.each([
      [GRAPHQL_DC_CHANNEL_PARSE, {}, 'graphql.parse'],
      [GRAPHQL_DC_CHANNEL_VALIDATE, {}, 'graphql.validate'],
      [
        GRAPHQL_DC_CHANNEL_RESOLVE,
        { fieldName: 'name', parentType: 'User', fieldType: 'String', fieldPath: 'user.0.name' },
        'graphql.resolve user.0.name',
      ],
      [GRAPHQL_DC_CHANNEL_EXECUTE, { operationType: 'query', operationName: 'GetUser' }, 'query GetUser'],
      [GRAPHQL_DC_CHANNEL_EXECUTE, {}, 'graphql.execute'],
    ])('keeps the %s span name', async (channel, data, expected) => {
      initTestClient('static');

      const { spanName } = await traceOperation(channel, data);

      expect(spanName).toBe(expected);
    });

    it('renames the root span with the operation', async () => {
      initTestClient('static');

      const { enclosingSpanName } = await traceOperation(GRAPHQL_DC_CHANNEL_EXECUTE, {
        operationType: 'query',
        operationName: 'GetUser',
      });

      expect(enclosingSpanName).toBe('GET /graphql (query GetUser)');
    });
  });
});
