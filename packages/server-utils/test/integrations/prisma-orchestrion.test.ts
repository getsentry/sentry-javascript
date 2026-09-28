import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import type { Client, Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  addChildSpanToSpan,
  getActiveSpan,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  GLOBAL_OBJ,
  SentryNonRecordingSpan,
  setAsyncContextStrategy,
  withActiveSpan,
} from '@sentry/core';
import type { MockInstance } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaIntegration } from '../../src/integrations/prisma';
import { instrumentPrismaV8 } from '../../src/integrations/prisma/orchestrion';
import { CHANNELS } from '../../src/orchestrion/channels';
import {
  PRISMA_ASYNC_TERMINALS,
  PRISMA_LAZY_TERMINALS,
  prismaChannels,
  prismaConfig,
} from '../../src/orchestrion/config/prisma';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// `setup` only subscribes once an async-context strategy exposes `getTracingChannelBinding`.
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
    getTracingChannelBinding: () => ({ asyncLocalStorage: asyncStorage }),
  });
}

function makeSpan(name: string): Span {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttributes: vi.fn(),
    isRecording: () => true,
    spanContext: () => ({ spanId: name, traceId: 'trace', traceFlags: 1 }),
  } as unknown as Span;
}

// Stand-in for Prisma's `AsyncIterableResult`: `then` funnels through `toArray`, `query` runs on consumption.
function makeLazyResult(query: () => unknown[]): {
  then: Promise<unknown[]>['then'];
  toArray: () => Promise<unknown[]>;
  [Symbol.asyncIterator]: () => AsyncGenerator<unknown>;
} {
  return {
    toArray() {
      return Promise.resolve().then(query);
    },
    then(onFulfilled, onRejected) {
      return this.toArray().then(onFulfilled, onRejected);
    },
    async *[Symbol.asyncIterator]() {
      yield* query();
    },
  };
}

const PARENT_SPAN = makeSpan('parent');

describe('prisma orchestrion config', () => {
  it('has one config per terminal, lazy terminals wrapped as Sync', () => {
    const byMethod = new Map(
      prismaConfig.map(config => [
        (config.functionQuery as { methodName: string }).methodName,
        (config.functionQuery as { kind: string }).kind,
      ]),
    );

    expect([...byMethod.keys()].sort()).toEqual([...PRISMA_ASYNC_TERMINALS, ...PRISMA_LAZY_TERMINALS].sort());
    PRISMA_ASYNC_TERMINALS.forEach(method => expect(byMethod.get(method)).toBe('Async'));
    PRISMA_LAZY_TERMINALS.forEach(method => expect(byMethod.get(method)).toBe('Sync'));
    expect(Object.values(prismaChannels).sort()).toEqual(
      prismaConfig.map(config => `orchestrion:${config.module.name}:${config.channelName}`).sort(),
    );
  });
});

describe('instrumentPrismaV8', () => {
  let startInactiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    span = makeSpan('operation');
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Subscriptions are process-global, so this has to run before anything subscribes.
  it('does not subscribe at all when the operation span type is ignored', () => {
    instrumentPrismaV8({ ignoreSpanTypes: [/^prisma:client:operation$/] });

    expect(tracingChannel(CHANNELS.PRISMA_CREATE).start.hasSubscribers).toBe(false);
    expect(tracingChannel(CHANNELS.PRISMA_ALL).start.hasSubscribers).toBe(false);
  });

  it('subscribes through the integration once the Prisma module is injected', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@prisma/orm-family-sql'] };
    prismaIntegration().setup?.({ on: () => () => undefined } as unknown as Client);

    Object.values(prismaChannels).forEach(channel => {
      expect(tracingChannel(channel).start.hasSubscribers).toBe(true);
    });
  });

  it('async terminal: opens an operation span for the call and ends it when the promise settles', async () => {
    const ctx = { arguments: [{ email: 'a@b.c' }], self: { modelName: 'User', tableName: 'user' } };

    let activeDuringCall: Span | undefined;
    await withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_CREATE).tracePromise(async () => {
        activeDuringCall = getActiveSpan();
        return { id: 1 };
      }, ctx),
    );

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'prisma:client:operation',
        parentSpan: PARENT_SPAN,
        attributes: {
          'sentry.origin': 'auto.db.prisma',
          'sentry.op': 'db',
          'db.operation.name': 'create',
          'db.collection.name': 'user',
          method: 'create',
          model: 'User',
          name: 'User.create',
        },
      }),
    );
    expect(activeDuringCall).toBe(span);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('reuses the outer operation span when a terminal calls another terminal', async () => {
    const self = { modelName: 'User' };

    let activeDuringInnerCall: Span | undefined;
    await withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_DELETE).tracePromise(
        () =>
          tracingChannel(CHANNELS.PRISMA_FIRST).tracePromise(
            async () => {
              activeDuringInnerCall = getActiveSpan();
              return { id: 1 };
            },
            { arguments: [], self },
          ),
        { arguments: [], self },
      ),
    );

    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ method: 'delete' }) }),
    );
    expect(activeDuringInnerCall).toBe(span);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('does not open a span without a parent', async () => {
    await tracingChannel(CHANNELS.PRISMA_CREATE).tracePromise(async () => ({ id: 1 }), {
      arguments: [],
      self: { modelName: 'User' },
    });

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });

  it('async terminal: marks the span as errored when the promise rejects', async () => {
    await expect(
      withActiveSpan(PARENT_SPAN, () =>
        tracingChannel(CHANNELS.PRISMA_DELETE).tracePromise(
          async () => {
            throw new Error('boom');
          },
          { arguments: [], self: { modelName: 'User' } },
        ),
      ),
    ).rejects.toThrow('boom');

    expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything(), message: 'boom' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: keeps the span open until the result is awaited, and runs the query under it', async () => {
    let activeDuringQuery: Span | undefined;
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(
        () =>
          makeLazyResult(() => {
            activeDuringQuery = getActiveSpan();
            return [{ id: 1 }];
          }),
        { arguments: [], self: { modelName: 'User' } },
      ),
    );

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ method: 'all', model: 'User' }) }),
    );
    expect(span.end).not.toHaveBeenCalled();

    await expect(result).resolves.toEqual([{ id: 1 }]);

    expect(activeDuringQuery).toBe(span);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: ends the span when a `for await` loop finishes', async () => {
    let activeDuringQuery: Span | undefined;
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(
        () =>
          makeLazyResult(() => {
            activeDuringQuery = getActiveSpan();
            return [1, 2];
          }),
        { arguments: [], self: { modelName: 'User' } },
      ),
    );

    const rows: unknown[] = [];
    for await (const row of result) {
      rows.push(row);
      expect(span.end).not.toHaveBeenCalled();
    }

    expect(rows).toEqual([1, 2]);
    expect(activeDuringQuery).toBe(span);
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: ends the span when a `for await` loop breaks early', async () => {
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(() => makeLazyResult(() => [1, 2, 3]), {
        arguments: [],
        self: { modelName: 'User' },
      }),
    );

    for await (const row of result) {
      if (row === 2) {
        break;
      }
    }

    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: marks the span as errored when consuming the result rejects', async () => {
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(
        () =>
          makeLazyResult(() => {
            throw new Error('query failed');
          }),
        { arguments: [], self: { modelName: 'User' } },
      ),
    );

    await expect(result).rejects.toThrow('query failed');

    expect(span.setStatus).toHaveBeenCalledWith({ code: expect.anything(), message: 'query failed' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: does not activate an ignored operation span while the query runs', async () => {
    const ignoredSpan = new SentryNonRecordingSpan({ dropReason: 'ignored' });
    addChildSpanToSpan(PARENT_SPAN, ignoredSpan);
    const ignoredSpanEnd = vi.spyOn(ignoredSpan, 'end');
    startInactiveSpanSpy.mockReturnValue(ignoredSpan);

    let activeDuringQuery: Span | undefined;
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(
        () =>
          makeLazyResult(() => {
            activeDuringQuery = getActiveSpan();
            return [1];
          }),
        { arguments: [], self: { modelName: 'User' } },
      ),
    );

    await expect(withActiveSpan(PARENT_SPAN, () => result.toArray())).resolves.toEqual([1]);
    expect(activeDuringQuery).toBe(PARENT_SPAN);
    expect(ignoredSpanEnd).toHaveBeenCalledTimes(1);
  });

  it('lazy terminal: ends the span right away when the result cannot be patched', async () => {
    const result = withActiveSpan(PARENT_SPAN, () =>
      tracingChannel(CHANNELS.PRISMA_ALL).traceSync(() => Object.freeze(makeLazyResult(() => [1])), {
        arguments: [],
        self: { modelName: 'User' },
      }),
    );

    expect(span.end).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual([1]);
  });

  it('lazy terminal: ends the span right away when the call itself throws', () => {
    expect(() =>
      withActiveSpan(PARENT_SPAN, () =>
        tracingChannel(CHANNELS.PRISMA_ALL).traceSync(
          () => {
            throw new Error('bad filter');
          },
          { arguments: [], self: { modelName: 'User' } },
        ),
      ),
    ).toThrow('bad filter');

    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
