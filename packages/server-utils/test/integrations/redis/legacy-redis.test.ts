import { AsyncLocalStorage } from 'node:async_hooks';
import { tracingChannel } from 'node:diagnostics_channel';
import { DB_SYSTEM_NAME, SENTRY_ORIGIN, SERVER_ADDRESS, SERVER_PORT } from '@sentry/conventions/attributes';
import type { Client, Scope, Span } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import {
  _INTERNAL_setSpanForScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  GLOBAL_OBJ,
  SPAN_STATUS_ERROR,
  setAsyncContextStrategy,
} from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { redisIntegration } from '../../../src/integrations/redis';
import { CHANNELS } from '../../../src/orchestrion/channels';

interface TestStore {
  scope: Scope;
  isolationScope: Scope;
}

// Same minimal async-context strategy as the pg tests: `bindTracingChannelToSpan` only binds
// when a `getTracingChannelBinding` exists.
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
      getStoreWithActiveSpan: (span: Span) => {
        const scope = getScopes().scope.clone();
        const isolationScope = getScopes().isolationScope;
        _INTERNAL_setSpanForScope(scope, span);
        return { scope, isolationScope };
      },
    }),
  });
}

function makeSpan(): Span {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttributes: vi.fn(),
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }),
  } as unknown as Span;
}

type Callback = (err: Error | null | undefined, reply: unknown) => unknown;

interface LegacyCommand {
  command: string;
  args: string[];
  callback?: Callback;
}

// What redis v2-v3 passes to `internal_send_command`, published on the orchestrion channel.
function sendCommand(command: LegacyCommand, internalSendCommand: () => unknown = () => true): void {
  const ctx = { arguments: [command], self: { connection_options: { host: 'localhost', port: 6379 } } };
  tracingChannel(CHANNELS.REDIS_COMMAND).traceSync(internalSendCommand, ctx);
}

describe('redisIntegration (redis v2-v3)', () => {
  let startInactiveSpanSpy: MockInstance;
  let getActiveSpanSpy: MockInstance;
  let span: Span;

  beforeAll(() => {
    installTestAsyncContextStrategy();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['redis'] };
    redisIntegration().setup?.({ on: () => () => undefined } as unknown as Client);
  });

  afterAll(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  beforeEach(() => {
    span = makeSpan();
    startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan').mockReturnValue(span);
    getActiveSpanSpy = vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({} as Span);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a span and ends it when the command callback fires', () => {
    const originalCallback = vi.fn();
    const command: LegacyCommand = { command: 'set', args: ['key', 'value'], callback: originalCallback };

    sendCommand(command);

    expect(startInactiveSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          [DB_SYSTEM_NAME]: 'redis',
          [SENTRY_ORIGIN]: 'auto.db.redis',
          [SERVER_ADDRESS]: 'localhost',
          [SERVER_PORT]: 6379,
        }),
      }),
    );
    // The sync return must not end the span, the reply has not arrived yet.
    expect(span.end).not.toHaveBeenCalled();

    command.callback?.(null, 'OK');

    expect(span.end).toHaveBeenCalledTimes(1);
    expect(originalCallback).toHaveBeenCalledWith(null, 'OK');
  });

  it('marks the span as errored when the command callback gets an error', () => {
    const command: LegacyCommand = { command: 'incr', args: ['key'], callback: vi.fn() };

    sendCommand(command);
    command.callback?.(new Error('WRONGTYPE'), undefined);

    expect(span.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'WRONGTYPE' });
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('ends the span when the command throws synchronously', () => {
    const command: LegacyCommand = { command: 'set', args: ['key', 'value'], callback: vi.fn() };

    expect(() =>
      sendCommand(command, () => {
        throw new Error('connection closed');
      }),
    ).toThrow('connection closed');

    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: SPAN_STATUS_ERROR }));
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('does not start a span without a parent span', () => {
    getActiveSpanSpy.mockReturnValue(undefined);
    const originalCallback = vi.fn();
    const command: LegacyCommand = { command: 'set', args: ['key', 'value'], callback: originalCallback };

    sendCommand(command);

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
    expect(command.callback).toBe(originalCallback);
  });

  it('does not start a span for a command without a callback', () => {
    sendCommand({ command: 'set', args: ['key', 'value'] });

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
  });
});
