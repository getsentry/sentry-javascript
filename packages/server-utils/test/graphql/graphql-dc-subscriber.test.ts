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
  _resetGraphqlDiagnosticChannelsForTesting,
  GRAPHQL_DC_CHANNEL_EXECUTE,
  GRAPHQL_DC_CHANNEL_PARSE,
  GRAPHQL_DC_CHANNEL_SUBSCRIBE,
  GRAPHQL_DC_CHANNEL_VALIDATE,
  type GraphqlTracingChannelFactory,
  subscribeGraphqlDiagnosticChannels,
} from '../../src/graphql/graphql-dc-subscriber';

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

/**
 * Build a minimal parsed-document stand-in for the redactor. The redactor only walks the token
 * linked list and acts on literal-kind tokens, so the fake only needs the source body plus the
 * literal tokens (offsets are derived by searching the body). This mirrors the real graphql-js
 * `DocumentNode.loc` shape without depending on graphql at test time.
 */
function makeDocument(body: string, literals: Array<{ text: string; kind: string }>): unknown {
  let cursor = 0;
  const startToken: any = { kind: '<SOF>', start: 0, end: 0, next: null };
  let prev = startToken;
  for (const { text, kind } of literals) {
    const start = body.indexOf(text, cursor);
    if (start < 0) {
      throw new Error(`literal not found in body: ${text}`);
    }
    const end = start + text.length;
    cursor = end;
    const token = { kind, start, end, next: null };
    prev.next = token;
    prev = token;
  }
  return { loc: { source: { body }, startToken } };
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

const factory = tracingChannel as GraphqlTracingChannelFactory;

describe('subscribeGraphqlDiagnosticChannels', () => {
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  // `node:diagnostics_channel` channels are process-global. `_reset…` calls each binding's `unbind`,
  // so we can subscribe and fully detach per test without handlers leaking across tests.
  beforeEach(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
    subscribeGraphqlDiagnosticChannels(factory);
  });

  afterEach(() => {
    _resetGraphqlDiagnosticChannelsForTesting();
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  describe('parse channel', () => {
    it('creates a graphql.parse span', async () => {
      const { span } = await traceOperation(GRAPHQL_DC_CHANNEL_PARSE, { source: '{ hello }' }, { result: {} });

      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('graphql.parse');
      expect(json.op).toBe('graphql');
      expect(json.origin).toBe('auto.graphql.diagnostic_channel');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('validate channel', () => {
    it('creates a graphql.validate span with the redacted document', async () => {
      const document = makeDocument('query Q { user(id: 42) { name } }', [{ text: '42', kind: 'Int' }]);
      const { span } = await traceOperation(GRAPHQL_DC_CHANNEL_VALIDATE, { document }, { result: [] });

      const json = spanToJSON(span!);
      expect(json.description).toBe('graphql.validate');
      expect(json.op).toBe('graphql');
      expect(json.data['graphql.document']).toBe('query Q { user(id: *) { name } }');
    });

    it('sets error status when validation returns errors', async () => {
      const document = makeDocument('{ unknownField }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_VALIDATE,
        { document },
        { result: [new Error('Cannot query field "unknownField"')] },
      );

      expect(spanToJSON(span!).status).toBe('invalid_argument');
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });
  });

  describe('execute channel', () => {
    it('names the span "<type> <name>" and sets graphql semconv attributes', async () => {
      const document = makeDocument('query GetUser { user { name } }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'query', operationName: 'GetUser' },
        { result: { data: { user: { name: 'a' } } } },
      );

      const json = spanToJSON(span!);
      expect(json.description).toBe('query GetUser');
      expect(json.op).toBe('graphql');
      expect(json.origin).toBe('auto.graphql.diagnostic_channel');
      expect(json.data['graphql.operation.type']).toBe('query');
      expect(json.data['graphql.operation.name']).toBe('GetUser');
      expect(json.data['graphql.document']).toBe('query GetUser { user { name } }');
    });

    it('falls back to "<type>" for anonymous operations', async () => {
      const document = makeDocument('{ hello }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'query' },
        { result: { data: { hello: 'world' } } },
      );

      expect(spanToJSON(span!).description).toBe('query');
      expect(spanToJSON(span!).data['graphql.operation.name']).toBeUndefined();
    });

    it('redacts inline literal values from graphql.document', async () => {
      const document = makeDocument('mutation { login(email: "secret@example.com", age: 30) }', [
        { text: '"secret@example.com"', kind: 'String' },
        { text: '30', kind: 'Int' },
      ]);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'mutation' },
        { result: { data: {} } },
      );

      const graphqlDocument = spanToJSON(span!).data['graphql.document'] as string;
      expect(graphqlDocument).toBe('mutation { login(email: "*", age: *) }');
      expect(graphqlDocument).not.toContain('secret@example.com');
      expect(graphqlDocument).not.toContain('30');
    });

    it('sets error status when the result carries GraphQL errors', async () => {
      const document = makeDocument('mutation M { fail }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'mutation', operationName: 'M' },
        { result: { errors: [{ message: 'boom' }] } },
      );

      expect(spanToJSON(span!).status).toBe('internal_error');
      // GraphQL errors are returned to the caller; we annotate the span but do not capture an event.
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('sets error status and does NOT capture an exception when execution throws', async () => {
      const document = makeDocument('query Q { x }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'query', operationName: 'Q' },
        { error: new Error('execution exploded') },
      );

      // A thrown error sets the span status from the error message (handled by `bindTracingChannelToSpan`).
      expect(spanToJSON(span!).status).toBe('execution exploded');
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('parents the execute span to the surrounding span and parents children to it', async () => {
      const document = makeDocument('{ hello }', []);
      let outerSpanId: string | undefined;
      let result: Awaited<ReturnType<typeof traceOperation>> | undefined;

      await startSpan({ name: 'outer' }, async outer => {
        outerSpanId = outer.spanContext().spanId;
        result = await traceOperation(
          GRAPHQL_DC_CHANNEL_EXECUTE,
          { document, operationType: 'query' },
          { result: { data: {} } },
        );
      });

      expect(spanToJSON(result!.span!).parent_span_id).toBe(outerSpanId);
      expect(result!.childParentSpanId).toBe(result!.span!.spanContext().spanId);
    });
  });

  describe('subscribe channel', () => {
    it('names the span "subscription <name>"', async () => {
      const document = makeDocument('subscription OnMsg { messageAdded }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_SUBSCRIBE,
        { document, operationType: 'subscription', operationName: 'OnMsg' },
        { result: {} },
      );

      const json = spanToJSON(span!);
      expect(json.description).toBe('subscription OnMsg');
      expect(json.op).toBe('graphql');
      expect(json.origin).toBe('auto.graphql.diagnostic_channel');
    });
  });

  describe('idempotency', () => {
    it('does not re-subscribe on a second call', async () => {
      // A second subscribe must be a no-op: a single execute should still bind exactly one span.
      subscribeGraphqlDiagnosticChannels(factory);

      const document = makeDocument('{ hello }', []);
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_EXECUTE,
        { document, operationType: 'query' },
        { result: { data: {} } },
      );

      expect(span).toBeDefined();
      expect(spanToJSON(span!).op).toBe('graphql');
    });
  });
});
