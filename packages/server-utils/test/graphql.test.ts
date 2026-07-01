import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getClient,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import * as graphql from 'graphql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { graphqlChannelIntegration } from '../src/integrations/tracing-channel/graphql';
import { CHANNELS } from '../src/orchestrion/channels';

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

function buildSchema(): graphql.GraphQLSchema {
  return new graphql.GraphQLSchema({
    query: new graphql.GraphQLObjectType({
      name: 'Query',
      fields: {
        hello: { type: graphql.GraphQLString, resolve: () => 'world' },
        boom: {
          type: graphql.GraphQLString,
          resolve: () => {
            throw new Error('resolver failed');
          },
        },
      },
    }),
  });
}

// Mimic the orchestrion transform: wrap the real graphql function in the matching tracing channel.
// `ctx.arguments[0]` is the SAME object the wrapped call receives, so any mutation the subscriber
// makes in `start` reaches the real call — exactly as the injected `tracingChannel(...).trace*` does.
function tracedParse(source: string): graphql.DocumentNode {
  return tracingChannel(CHANNELS.GRAPHQL_PARSE).traceSync(() => graphql.parse(source), { arguments: [source] } as any);
}

function tracedValidate(
  schema: graphql.GraphQLSchema,
  document: graphql.DocumentNode,
): readonly graphql.GraphQLError[] {
  return tracingChannel(CHANNELS.GRAPHQL_VALIDATE).traceSync(() => graphql.validate(schema, document), {
    arguments: [schema, document],
  } as any);
}

function tracedExecute(args: graphql.ExecutionArgs): Promise<graphql.ExecutionResult> {
  const ctx = { arguments: [args], self: graphql } as any;
  return tracingChannel(CHANNELS.GRAPHQL_EXECUTE).tracePromise(
    () => Promise.resolve(graphql.execute(ctx.arguments[0])) as Promise<graphql.ExecutionResult>,
    ctx,
  );
}

// graphql v16 rejects positional `execute(schema, document, …)` at runtime (the installed version),
// so we can't call the real function — but the subscriber's arg normalization still runs first. Drive
// the channel with the positional (v14/v15) shape and a stub op to exercise that branch in isolation.
function tracedExecutePositional(schema: graphql.GraphQLSchema, document: graphql.DocumentNode): void {
  const ctx = {
    arguments: [schema, document, undefined, undefined, undefined, undefined, undefined, undefined],
    self: graphql,
  } as any;
  tracingChannel(CHANNELS.GRAPHQL_EXECUTE).traceSync(() => ({ data: {} }), ctx);
}

function tracedExecuteRejecting(args: graphql.ExecutionArgs, error: Error): Promise<graphql.ExecutionResult> {
  const ctx = { arguments: [args], self: graphql } as any;
  return tracingChannel(CHANNELS.GRAPHQL_EXECUTE).tracePromise(() => Promise.reject(error), ctx);
}

// Drive the execute channel with a stub op for cases the real `graphql.execute` would reject (e.g. a
// document with no operation definition, or no document at all).
function tracedExecuteStub(args: Partial<graphql.ExecutionArgs>): void {
  tracingChannel(CHANNELS.GRAPHQL_EXECUTE).traceSync(() => ({ data: {} }), { arguments: [args], self: graphql } as any);
}

describe('graphqlChannelIntegration', () => {
  let spans: Span[];

  beforeAll(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    // Subscribe exactly once — the tracing channels are global; re-subscribing per test would stack
    // duplicate span builders on the same channel.
    (graphqlChannelIntegration({ ignoreResolveSpans: false }) as { setupOnce: () => void }).setupOnce();
    getClient()!.on('spanEnd', span => spans.push(span));
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    spans = [];
  });

  function findSpan(name: string): Span | undefined {
    return spans.find(s => spanToJSON(s).description === name);
  }

  function withRoot(name: string, fn: () => Promise<void>): Promise<void> {
    return startSpan({ name, forceTransaction: true }, fn);
  }

  it('creates parse, validate and execute spans and preserves the return value', async () => {
    const schema = buildSchema();
    const document = tracedParse('query GetHello { hello }');
    const errors = tracedValidate(schema, document);

    let result: graphql.ExecutionResult | undefined;
    await withRoot('GET /graphql', async () => {
      result = await tracedExecute({ schema, document });
    });

    expect(errors).toHaveLength(0);
    expect(result?.data).toEqual({ hello: 'world' });

    expect(findSpan('graphql.parse')).toBeDefined();
    expect(findSpan('graphql.validate')).toBeDefined();

    const executeSpan = findSpan('query GetHello');
    expect(executeSpan).toBeDefined();
    const json = spanToJSON(executeSpan!);
    expect(json.origin).toBe('auto.graphql.orchestrion.graphql');
    expect(json.data['graphql.operation.type']).toBe('query');
    expect(json.data['graphql.operation.name']).toBe('GetHello');
  });

  it('names the execute span by operation type only when the operation is unnamed', async () => {
    const schema = buildSchema();
    const document = tracedParse('{ hello }');
    await withRoot('GET /graphql', async () => {
      await tracedExecute({ schema, document });
    });

    expect(findSpan('query')).toBeDefined();
  });

  it('renames the parse span for a schema document (no operation)', () => {
    tracedParse('type Query { hello: String }');

    expect(findSpan('graphql.parseSchema')).toBeDefined();
    expect(findSpan('graphql.parse')).toBeUndefined();
  });

  it('creates resolver spans nested under the execute span when enabled', async () => {
    const schema = buildSchema();
    const document = tracedParse('{ hello }');
    let executeSpanId: string | undefined;
    await withRoot('GET /graphql', async () => {
      await tracedExecute({ schema, document });
    });

    const executeSpan = findSpan('query')!;
    executeSpanId = executeSpan.spanContext().spanId;
    const resolveSpan = findSpan('graphql.resolve hello');
    expect(resolveSpan).toBeDefined();
    expect(spanToJSON(resolveSpan!).parent_span_id).toBe(executeSpanId);
  });

  it('marks the execute span as errored when the result contains errors', async () => {
    const schema = buildSchema();
    const document = tracedParse('{ boom }');

    let result: graphql.ExecutionResult | undefined;
    await withRoot('GET /graphql', async () => {
      result = await tracedExecute({ schema, document });
    });

    expect(result?.errors?.length).toBeGreaterThan(0);
    expect(spanToJSON(findSpan('query')!).status).toBe('internal_error');
  });

  it('renames the enclosing root span to include the operation name', async () => {
    const schema = buildSchema();
    const document = tracedParse('query GetHello { hello }');

    let rootSpan: Span | undefined;
    await startSpan({ name: 'GET /graphql', forceTransaction: true }, async span => {
      rootSpan = span;
      await tracedExecute({ schema, document });
    });

    expect(spanToJSON(rootSpan!).description).toBe('GET /graphql (query GetHello)');
  });

  it('reads the operation from positional execute args (v14/v15 signature)', async () => {
    const schema = buildSchema();
    const document = tracedParse('query GetHello { hello }');

    // Under an explicit root so the execute span isn't renamed onto itself (see root-rename test).
    await withRoot('GET /graphql', async () => {
      tracedExecutePositional(schema, document);
    });

    const executeSpan = findSpan('query GetHello');
    expect(executeSpan).toBeDefined();
    expect(spanToJSON(executeSpan!).data['graphql.operation.type']).toBe('query');
    expect(spanToJSON(executeSpan!).data['graphql.operation.name']).toBe('GetHello');
  });

  it('marks the execute span as errored when execute rejects', async () => {
    const schema = buildSchema();
    const document = tracedParse('{ hello }');

    await withRoot('GET /graphql', async () => {
      await expect(tracedExecuteRejecting({ schema, document }, new Error('execute failed'))).rejects.toThrow(
        'execute failed',
      );
    });

    // A thrown/rejected error annotates the span status with the error message (via the channel's
    // `error` handler), unlike a result carrying `errors` which uses a bare error status.
    expect(spanToJSON(findSpan('query')!).status).toBe('execute failed');
  });

  it('folds operationName into the span attribute when no operation definition resolves', () => {
    const schema = buildSchema();
    // A fragment-only document has no operation definition, so `getOperation` returns undefined.
    const document = tracedParse('fragment Frag on Query { hello }');

    tracedExecuteStub({ schema, document, operationName: 'Foo' });

    const span = findSpan('graphql.execute');
    expect(span).toBeDefined();
    expect(spanToJSON(span!).data['graphql.operation.name']).toBe('Operation "Foo" not supported');
  });

  it('never leaks the $operationName$ placeholder when there is no document', () => {
    const schema = buildSchema();

    tracedExecuteStub({ schema });

    const span = findSpan('graphql.execute');
    expect(span).toBeDefined();
    const name = spanToJSON(span!).data['graphql.operation.name'];
    expect(name).not.toContain('$operationName$');
    expect(name).toBe('Operation not supported');
  });

  it('does not re-wrap resolvers for a nested execute reusing the same contextValue', async () => {
    const schema = buildSchema();
    const document = tracedParse('{ hello }');
    // A single contextValue shared across two executes (e.g. batched/nested execution).
    const contextValue = {};

    await withRoot('GET /graphql', async () => {
      await tracedExecute({ schema, document, contextValue });
      await tracedExecute({ schema, document, contextValue });
    });

    // Each execute still opens its own span, and the shared context is instrumented exactly once.
    expect(spans.filter(s => spanToJSON(s).description === 'query')).toHaveLength(2);
    expect(spans.some(s => spanToJSON(s).description === 'graphql.resolve hello')).toBe(true);
  });
});
