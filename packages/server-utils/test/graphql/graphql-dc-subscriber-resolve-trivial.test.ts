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
  isDefaultResolver: true,
};

// Own file so it can subscribe with its own options (see sibling resolve test for why). Here: resolve
// spans on AND trivial spans kept, so even graphql's default property resolver gets a span.
describe('subscribeGraphqlDiagnosticChannels (resolve + trivial spans enabled)', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    subscribeGraphqlDiagnosticChannels(factory, { ignoreResolveSpans: false, ignoreTrivialResolveSpans: false });
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

  it('emits a span for the default resolver', async () => {
    const { span } = await traceOperation(GRAPHQL_DC_CHANNEL_RESOLVE, resolveData, { result: 'a' });
    expect(spanToJSON(span!).description).toBe('graphql.resolve user.name');
  });
});
