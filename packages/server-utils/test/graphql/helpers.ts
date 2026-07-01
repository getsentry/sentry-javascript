import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  Client,
  createTransport,
  getActiveSpan,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  initAndBind,
  resolvedSyncPromise,
  setAsyncContextStrategy,
  spanToJSON,
  startSpan,
} from '@sentry/core';
import type { GraphqlTracingChannelFactory } from '../../src/graphql/graphql-dc-subscriber';

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

export function initTestClient(): void {
  initAndBind(TestClient, {
    dsn: 'https://username@domain/123',
    integrations: [],
    sendClientReports: false,
    stackParser: () => [],
    tracesSampleRate: 1,
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => resolvedSyncPromise({})),
  });
}

export function installTestAsyncContextStrategy(): void {
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
export function makeDocument(body: string, literals: Array<{ text: string; kind: string }>): unknown {
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
export async function traceOperation(
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

export const factory = tracingChannel as GraphqlTracingChannelFactory;
