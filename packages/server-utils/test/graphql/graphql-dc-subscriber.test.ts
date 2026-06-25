import * as SentryCore from '@sentry/core';
import { getCurrentScope, getGlobalScope, setAsyncContextStrategy, spanToJSON, startSpan } from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPHQL_DC_CHANNEL_EXECUTE,
  GRAPHQL_DC_CHANNEL_PARSE,
  GRAPHQL_DC_CHANNEL_RESOLVE,
  GRAPHQL_DC_CHANNEL_SUBSCRIBE,
  GRAPHQL_DC_CHANNEL_VALIDATE,
  subscribeGraphqlDiagnosticChannels,
} from '../../src/graphql/graphql-dc-subscriber';
import { factory, initTestClient, installTestAsyncContextStrategy, makeDocument, traceOperation } from './helpers';

describe('subscribeGraphqlDiagnosticChannels', () => {
  let captureExceptionSpy: ReturnType<typeof vi.spyOn>;

  // The subscriber captures the async-context strategy's ALS when it binds, so the strategy must be
  // installed before we subscribe — and both must stay fixed for the file. We do that once here,
  // mirroring production where `setupOnce` subscribes a single time. Tests needing different options
  // (resolve channel on/off) live in their own files, which Vitest isolates in separate processes.
  beforeAll(() => {
    installTestAsyncContextStrategy();
    subscribeGraphqlDiagnosticChannels(factory);
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

  describe('resolve channel', () => {
    it('does not subscribe the resolve channel by default (ignoreResolveSpans defaults to true)', async () => {
      // We subscribed without options, so the resolve channel has no Sentry handler.
      const { span } = await traceOperation(
        GRAPHQL_DC_CHANNEL_RESOLVE,
        {
          fieldName: 'name',
          parentType: 'User',
          fieldType: 'String',
          fieldPath: 'user.name',
          isDefaultResolver: false,
        },
        { result: 'a' },
      );
      expect(span).toBeUndefined();
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
