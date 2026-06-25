import { getCurrentScope, getGlobalScope, setAsyncContextStrategy, spanToJSON } from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRAPHQL_DC_CHANNEL_RESOLVE,
  subscribeGraphqlDiagnosticChannels,
} from '../../src/graphql/graphql-dc-subscriber';
import { factory, initTestClient, installTestAsyncContextStrategy, traceOperation } from './helpers';

const resolveData = {
  fieldName: 'name',
  parentType: 'User',
  fieldType: 'String',
  fieldPath: 'user.name',
  isDefaultResolver: false,
};

// `subscribeGraphqlDiagnosticChannels` is process-global and idempotent, so each option configuration
// is exercised in its own file — Vitest isolates files in separate processes. Here: resolve spans on,
// trivial (default-resolver) spans still ignored (the `ignoreTrivialResolveSpans` default).
describe('subscribeGraphqlDiagnosticChannels (resolve spans enabled)', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    subscribeGraphqlDiagnosticChannels(factory, { ignoreResolveSpans: false });
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  beforeEach(() => {
    initTestClient();
  });

  afterEach(() => {
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
    getGlobalScope().clear();
    vi.clearAllMocks();
  });

  it('creates a graphql.resolve span with field attributes', async () => {
    const { span } = await traceOperation(GRAPHQL_DC_CHANNEL_RESOLVE, resolveData, { result: 'a' });

    const json = spanToJSON(span!);
    expect(json.description).toBe('graphql.resolve user.name');
    expect(json.op).toBe('graphql');
    expect(json.origin).toBe('auto.graphql.diagnostic_channel');
    expect(json.data['graphql.field.name']).toBe('name');
    expect(json.data['graphql.field.path']).toBe('user.name');
    expect(json.data['graphql.field.type']).toBe('String');
    expect(json.data['graphql.parent.name']).toBe('User');
  });

  it('skips the default property resolver while ignoreTrivialResolveSpans is true (default)', async () => {
    const { span } = await traceOperation(
      GRAPHQL_DC_CHANNEL_RESOLVE,
      { ...resolveData, isDefaultResolver: true },
      { result: 'a' },
    );
    expect(span).toBeUndefined();
  });
});
