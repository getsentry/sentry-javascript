import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  setAsyncContextStrategy,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { firebaseChannelIntegration } from '../../src/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `bindTracingChannelToSpan` only binds (and `setupOnce` only subscribes via
// `waitForTracingChannelBinding`) when an async-context strategy exposes a
// `getTracingChannelBinding`. Install a minimal one so the channel
// subscriptions actually register in this unit-test context (no SDK `init`).
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

function makeSpan(): Span {
  return { end: vi.fn(), setStatus: vi.fn(), setAttributes: vi.fn() } as unknown as Span;
}

// A minimal Firestore reference shaped like what `addDoc`/`getDocs`/... receive as `arguments[0]`.
function makeReference(
  path: string,
  type: string,
  parent: unknown = null,
  host = 'localhost:8080',
): Record<string, unknown> {
  const firestore = {
    app: {
      name: '[DEFAULT]',
      options: {
        projectId: 'sentry-15d85',
        appId: 'app-id',
        messagingSenderId: 'sender-id',
        storageBucket: 'bucket',
      },
    },
    settings: { host },
    toJSON: () => ({ settings: { host } }),
  };
  return { id: 'ref-id', path, type, parent, firestore };
}

interface ChannelContext {
  arguments: unknown[];
  self?: unknown;
}

describe('firebaseChannelIntegration', () => {
  beforeAll(() => {
    installTestAsyncContextStrategy();
    firebaseChannelIntegration().setupOnce?.();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
  });

  describe('firestore', () => {
    let startInactiveSpanSpy: MockInstance;
    let span: Span;

    beforeEach(() => {
      span = makeSpan();
      startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('addDoc: builds a `db.query` span from the collection reference with the orchestrion origin', async () => {
      const ctx: ChannelContext = { arguments: [makeReference('cities', 'collection')] };

      await tracingChannel(CHANNELS.FIREBASE_FIRESTORE_ADD_DOC).tracePromise(async () => ({}), ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'addDoc cities',
          op: 'db.query',
          attributes: expect.objectContaining({
            'sentry.origin': 'auto.firebase.orchestrion.firestore',
            'db.operation.name': 'addDoc',
            'db.collection.name': 'cities',
            'db.namespace': '[DEFAULT]',
            'db.system.name': 'firebase.firestore',
            'firebase.firestore.type': 'collection',
            'firebase.firestore.options.projectId': 'sentry-15d85',
            'server.address': 'localhost',
            'server.port': 8080,
          }),
        }),
      );
      // Ended on `asyncEnd` (the full promise round-trip).
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('getDocs: names the span after the queried collection reference', async () => {
      const ctx: ChannelContext = { arguments: [makeReference('cities', 'collection')] };

      await tracingChannel(CHANNELS.FIREBASE_FIRESTORE_GET_DOCS).tracePromise(async () => ({ docs: [] }), ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'getDocs cities', op: 'db.query' }),
      );
    });

    it('setDoc: names the span after the parent collection of the document reference', async () => {
      const parent = makeReference('cities', 'collection');
      const docRef = makeReference('cities/SF', 'document', parent);
      const ctx: ChannelContext = { arguments: [docRef, { name: 'SF' }] };

      await tracingChannel(CHANNELS.FIREBASE_FIRESTORE_SET_DOC).tracePromise(async () => undefined, ctx);

      expect(startInactiveSpanSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'setDoc cities',
          attributes: expect.objectContaining({ 'db.operation.name': 'setDoc', 'db.collection.name': 'cities' }),
        }),
      );
    });

    it('deleteDoc: sets error status and ends the span when the operation rejects', async () => {
      const parent = makeReference('cities', 'collection');
      const docRef = makeReference('cities/SF', 'document', parent);
      const ctx: ChannelContext = { arguments: [docRef] };

      await expect(
        tracingChannel(CHANNELS.FIREBASE_FIRESTORE_DELETE_DOC).tracePromise(async () => {
          throw new Error('boom');
        }, ctx),
      ).rejects.toThrow('boom');

      expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything(), message: 'boom' });
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('does not build a span when the reference argument is missing', async () => {
      const ctx: ChannelContext = { arguments: [] };

      await tracingChannel(CHANNELS.FIREBASE_FIRESTORE_ADD_DOC).tracePromise(async () => ({}), ctx);

      expect(startInactiveSpanSpy).not.toHaveBeenCalled();
    });
  });

  describe('functions', () => {
    let startSpanManualSpy: MockInstance;
    let captureExceptionSpy: MockInstance;
    let span: Span;

    beforeEach(() => {
      span = makeSpan();
      // Drive the callback with a fake span so we can assert the span lifecycle.
      startSpanManualSpy = vi
        .spyOn(SentryCore, 'startSpanManual')
        .mockImplementation((_options: unknown, callback: unknown) => (callback as (s: Span) => unknown)(span));
      captureExceptionSpy = vi.spyOn(SentryCore, 'captureException').mockImplementation(() => 'id');
      vi.spyOn(SentryCore, 'flush').mockResolvedValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Publish `start`, then read the (mutated) handler back out of the context — this is what
    // orchestrion's transform forwards to the real `onRequest(...)` call.
    function registerAndGetWrappedHandler(channel: string, args: unknown[]): (...a: unknown[]) => unknown {
      const ctx: ChannelContext = { arguments: args };
      tracingChannel(channel).traceSync(() => undefined, ctx);
      const handlerIndex = typeof ctx.arguments[0] === 'function' ? 0 : 1;
      return ctx.arguments[handlerIndex] as (...a: unknown[]) => unknown;
    }

    it('onRequest: rewraps the handler and opens a SERVER span with the orchestrion origin on invocation', async () => {
      const original = vi.fn().mockResolvedValue('ok');
      const wrapped = registerAndGetWrappedHandler(CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST, [original]);

      expect(wrapped).not.toBe(original);

      const result = await wrapped('req', 'res');

      expect(result).toBe('ok');
      expect(original).toHaveBeenCalledWith('req', 'res');
      expect(startSpanManualSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'firebase.function.http.request',
          op: 'http.request',
          attributes: expect.objectContaining({
            'sentry.origin': 'auto.firebase.orchestrion.functions',
            'faas.trigger': 'http.request',
            'faas.provider': 'firebase',
          }),
        }),
        expect.any(Function),
      );
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('firestore trigger: uses the document-created trigger and handles the `(document, handler)` signature', async () => {
      const original = vi.fn().mockResolvedValue(undefined);
      const wrapped = registerAndGetWrappedHandler(CHANNELS.FIREBASE_FUNCTIONS_FIRESTORE_CREATED, [
        'cities/{cityId}',
        original,
      ]);

      await wrapped({ some: 'event' });

      expect(original).toHaveBeenCalledWith({ some: 'event' });
      expect(startSpanManualSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'firebase.function.firestore.document.created',
          attributes: expect.objectContaining({ 'faas.trigger': 'firestore.document.created' }),
        }),
        expect.any(Function),
      );
    });

    it('captures the error, ends the span, and rethrows when the handler throws', async () => {
      const error = new Error('handler failed');
      const original = vi.fn().mockRejectedValue(error);
      const wrapped = registerAndGetWrappedHandler(CHANNELS.FIREBASE_FUNCTIONS_HTTP_CALL, [original]);

      await expect(wrapped()).rejects.toThrow('handler failed');

      expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything() });
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          mechanism: expect.objectContaining({ type: 'auto.firebase.orchestrion.functions' }),
        }),
      );
      expect(span.end).toHaveBeenCalledTimes(1);
    });

    it('does not double-wrap an already-wrapped handler', () => {
      const original = vi.fn();
      const wrappedOnce = registerAndGetWrappedHandler(CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST, [original]);
      const ctx: ChannelContext = { arguments: [wrappedOnce] };
      tracingChannel(CHANNELS.FIREBASE_FUNCTIONS_HTTP_REQUEST).traceSync(() => undefined, ctx);

      expect(ctx.arguments[0]).toBe(wrappedOnce);
    });
  });
});
