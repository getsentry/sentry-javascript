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
  _resetMongooseDiagnosticChannelsForTesting,
  MONGOOSE_DC_CHANNEL_AGGREGATE,
  MONGOOSE_DC_CHANNEL_CURSOR_NEXT,
  MONGOOSE_DC_CHANNEL_MODEL_BULK_WRITE,
  MONGOOSE_DC_CHANNEL_MODEL_INSERT_MANY,
  MONGOOSE_DC_CHANNEL_MODEL_SAVE,
  MONGOOSE_DC_CHANNEL_QUERY,
  type MongooseTracingChannelFactory,
  subscribeMongooseDiagnosticChannels,
} from '../../src/mongoose/mongoose-dc-subscriber';

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

const factory = tracingChannel as MongooseTracingChannelFactory;

describe('subscribeMongooseDiagnosticChannels', () => {
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  // `node:diagnostics_channel` channels are process-global. `_reset…` calls each binding's `unbind`,
  // so we can subscribe and fully detach per test without handlers leaking across tests.
  beforeEach(() => {
    installTestAsyncContextStrategy();
    initTestClient();
    captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockReturnValue('event-id');
    subscribeMongooseDiagnosticChannels(factory);
  });

  afterEach(() => {
    _resetMongooseDiagnosticChannelsForTesting();
    setAsyncContextStrategy(undefined);
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  describe('query channel', () => {
    it('creates a db span with stable semconv attributes', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_QUERY,
        {
          operation: 'findOne',
          collection: 'blogposts',
          database: 'test',
          serverAddress: '127.0.0.1',
          serverPort: 27017,
          args: { filter: { title: 'secret', views: { $gt: 100 } } },
        },
        { result: { title: 'secret' } },
      );

      expect(span).toBeDefined();
      const json = spanToJSON(span!);
      expect(json.description).toBe('mongoose.blogposts.findOne');
      expect(json.op).toBe('db');
      expect(json.origin).toBe('auto.db.mongoose.diagnostic_channel');
      expect(json.data['db.system.name']).toBe('mongodb');
      expect(json.data['db.operation.name']).toBe('findOne');
      expect(json.data['db.collection.name']).toBe('blogposts');
      expect(json.data['db.namespace']).toBe('test');
      expect(json.data['server.address']).toBe('127.0.0.1');
      expect(json.data['server.port']).toBe(27017);
      expect(json.timestamp).toBeDefined();
    });

    it('redacts filter values in db.query.text but keeps keys and operators', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_QUERY,
        { operation: 'find', collection: 'users', args: { filter: { email: 'a@b.com', age: { $gte: 21 } } } },
        { result: [] },
      );

      const queryText = spanToJSON(span!).data['db.query.text'] as string;
      expect(queryText).toBe('{"email":"?","age":{"$gte":"?"}}');
      // raw values never leak
      expect(queryText).not.toContain('a@b.com');
      expect(queryText).not.toContain('21');
    });

    it('omits db.query.text for an empty filter', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_QUERY,
        { operation: 'find', collection: 'users', args: { filter: {} } },
        { result: [] },
      );

      expect(spanToJSON(span!).data['db.query.text']).toBeUndefined();
    });

    it('sets error status and does NOT capture an exception on failure', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_QUERY,
        { operation: 'findOne', collection: 'users', args: { filter: { _id: 1 } } },
        { error: new Error('connection lost') },
      );

      expect(spanToJSON(span!).status).toBe('connection lost');
      expect(spanToJSON(span!).timestamp).toBeDefined();
      expect(captureExceptionSpy).not.toHaveBeenCalled();
    });

    it('parents the mongoose span to the surrounding span and parents children to it', async () => {
      let outerSpanId: string | undefined;
      let result: Awaited<ReturnType<typeof traceOperation>> | undefined;

      await startSpan({ name: 'outer' }, async outer => {
        outerSpanId = outer.spanContext().spanId;
        result = await traceOperation(
          MONGOOSE_DC_CHANNEL_QUERY,
          { operation: 'find', collection: 'users', args: { filter: {} } },
          { result: [] },
        );
      });

      expect(spanToJSON(result!.span!).parent_span_id).toBe(outerSpanId);
      expect(result!.childParentSpanId).toBe(result!.span!.spanContext().spanId);
    });
  });

  describe('aggregate channel', () => {
    it('redacts pipeline values and handles a missing collection', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_AGGREGATE,
        { operation: 'aggregate', args: { pipeline: [{ $match: { status: 'active' } }] } },
        { result: [] },
      );

      const json = spanToJSON(span!);
      // connection-level aggregate has no collection -> name degrades gracefully
      expect(json.description).toBe('mongoose.aggregate');
      expect(json.data['db.collection.name']).toBeUndefined();
      expect(json.data['db.query.text']).toBe('[{"$match":{"status":"?"}}]');
    });
  });

  describe('model channels', () => {
    it('creates a save span', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_MODEL_SAVE,
        { operation: 'save', collection: 'blogposts', args: { options: {} } },
        { result: {} },
      );

      expect(spanToJSON(span!).description).toBe('mongoose.blogposts.save');
      expect(spanToJSON(span!).data['db.operation.name']).toBe('save');
    });

    it('sets db.operation.batch.size from insertMany docs (> 1 only)', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_MODEL_INSERT_MANY,
        { operation: 'insertMany', collection: 'blogposts', args: { docs: [{}, {}, {}] } },
        { result: [{}, {}, {}] },
      );

      expect(spanToJSON(span!).data['db.operation.batch.size']).toBe(3);
    });

    it('does not set batch size for a single insertMany doc', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_MODEL_INSERT_MANY,
        { operation: 'insertMany', collection: 'blogposts', args: { docs: [{}] } },
        { result: [{}] },
      );

      expect(spanToJSON(span!).data['db.operation.batch.size']).toBeUndefined();
    });

    it('sets db.operation.batch.size from bulkWrite ops', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_MODEL_BULK_WRITE,
        { operation: 'bulkWrite', collection: 'blogposts', args: { ops: [{}, {}] } },
        { result: {} },
      );

      expect(spanToJSON(span!).data['db.operation.batch.size']).toBe(2);
    });
  });

  describe('cursor channel', () => {
    it('creates a span per cursor iteration without treating cursor batchSize as an operation batch', async () => {
      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_CURSOR_NEXT,
        { operation: 'find', collection: 'blogposts', batchSize: 50, tailable: false, args: { filter: { a: 1 } } },
        { result: {} },
      );

      const json = spanToJSON(span!);
      expect(json.description).toBe('mongoose.blogposts.find');
      // cursor fetch batchSize is NOT db.operation.batch.size
      expect(json.data['db.operation.batch.size']).toBeUndefined();
      expect(json.data['db.query.text']).toBe('{"a":"?"}');
    });
  });

  describe('idempotency', () => {
    it('does not throw or double-subscribe on a second call', async () => {
      subscribeMongooseDiagnosticChannels(factory);

      const { span } = await traceOperation(
        MONGOOSE_DC_CHANNEL_QUERY,
        { operation: 'find', collection: 'users', args: { filter: {} } },
        { result: [] },
      );

      // a single subscription means a single span, ended exactly once
      expect(span).toBeDefined();
      expect(spanToJSON(span!).timestamp).toBeDefined();
    });
  });
});
