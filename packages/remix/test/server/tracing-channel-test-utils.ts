import { AsyncLocalStorage } from 'node:async_hooks';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import * as SentryNode from '@sentry/node';
import type { NodeClient } from '@sentry/node';
import { vi } from 'vitest';
import { instrumentRemix } from '../../src/server/integrations/tracing-channel';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds (and `setupOnce` only subscribes via
// `waitForTracingChannelBinding`) when an async-context strategy exposes a
// `getTracingChannelBinding`. Install a minimal one so the channel subscriptions
// actually register in this unit-test context (no SDK `init`).
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

export function teardownTestAsyncContextStrategy(): void {
  setAsyncContextStrategy(undefined);
  vi.restoreAllMocks();
}

export function makeSpan(data: Record<string, unknown> = {}): Span {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttributes: vi.fn(),
    setAttribute: vi.fn(),
    updateName: vi.fn(),
    getSpanJSON: () => ({ data }),
    getStreamedSpanJSON: () => ({ attributes: data }),
  } as unknown as Span;
}

export function makeRequest(
  overrides: { method?: string; url?: string; formEntries?: Record<string, string> } = {},
): Request {
  const { method = 'GET', url = 'http://localhost/test', formEntries } = overrides;
  return {
    method,
    url,
    clone: () => ({
      formData: async () => {
        const fd = new FormData();
        for (const [key, value] of Object.entries(formEntries ?? {})) {
          fd.append(key, value);
        }
        return fd;
      },
    }),
  } as unknown as Request;
}

/**
 * Install the async-context strategy, mock the client with the given form-data config, and orchestrion-based remix instrumentation
 * so the channel subscriptions register.
 * `captureActionFormDataKeys` left undefined mimics an app that hasn't opted into form-data capture.
 */
export function setupRemixInstrumentation(captureActionFormDataKeys?: Record<string, string | boolean>): void {
  installTestAsyncContextStrategy();
  vi.spyOn(SentryNode, 'getClient').mockReturnValue({
    getOptions: () => ({ captureActionFormDataKeys }),
    getDataCollectionOptions: () => ({ httpBodies: [] }),
  } as unknown as NodeClient);

  instrumentRemix(captureActionFormDataKeys ? { keys: captureActionFormDataKeys } : undefined);
}
