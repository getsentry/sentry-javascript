import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postgresChannelIntegration } from '../../src/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `setupOnce` only subscribes once `waitForTracingChannelBinding` sees an
// async-context strategy exposing `getTracingChannelBinding`. Install a
// minimal one so the subscriptions actually register here.
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

// `setupOnce` subscribes to process-global `tracingChannel`s, so asserting the
// ABSENCE of connect subscribers only holds when no other (default-options)
// integration in the same module context has subscribed. vitest isolates
// module state per file, so this file keeps that assertion clean (the default
// options integration is exercised in `postgres.test.ts`).
describe('postgresChannelIntegration({ ignoreConnectSpans: true })', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  it('subscribes to the query channel but NOT the connect / pool-connect channels', () => {
    postgresChannelIntegration({ ignoreConnectSpans: true }).setupOnce?.();

    expect(tracingChannel(CHANNELS.PG_QUERY).start.hasSubscribers).toBe(true);
    expect(tracingChannel(CHANNELS.PG_CONNECT).start.hasSubscribers).toBe(false);
    expect(tracingChannel(CHANNELS.PGPOOL_CONNECT).start.hasSubscribers).toBe(false);
  });
});
