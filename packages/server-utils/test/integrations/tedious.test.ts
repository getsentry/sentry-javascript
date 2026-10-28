import { tracingChannel } from 'node:diagnostics_channel';
import { EventEmitter } from 'node:events';
import type { Client } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { GLOBAL_OBJ, withActiveSpan } from '@sentry/core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { tediousIntegration } from '../../src/integrations/tedious';
import { CHANNELS } from '../../src/orchestrion/channels';

const QUERY_CHANNELS = [
  CHANNELS.TEDIOUS_EXEC_SQL,
  CHANNELS.TEDIOUS_EXEC_SQL_BATCH,
  CHANNELS.TEDIOUS_CALL_PROCEDURE,
  CHANNELS.TEDIOUS_EXEC_BULK_LOAD,
  CHANNELS.TEDIOUS_PREPARE,
  CHANNELS.TEDIOUS_EXECUTE,
];

describe('tediousIntegration', () => {
  const originalOrchestrionState = GLOBAL_OBJ.__SENTRY_ORCHESTRION__;

  beforeAll(() => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['tedious'] };
    tediousIntegration().setup?.({ on: () => () => undefined } as unknown as Client);
  });

  afterAll(() => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = originalOrchestrionState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(QUERY_CHANNELS)('does not create a span without an active parent on %s', channelName => {
    const startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan');
    const connection = new EventEmitter();
    const callback = vi.fn();
    const request = Object.assign(new EventEmitter(), {
      sqlTextOrProcedure: 'SELECT 1',
      callback,
    });

    withActiveSpan(null, () => {
      tracingChannel(channelName).start.publish({ self: connection, arguments: [request] });
    });

    expect(startInactiveSpanSpy).not.toHaveBeenCalled();
    expect(request.callback).toBe(callback);
    expect(request.eventNames()).toEqual([]);
    expect(connection.eventNames()).toEqual([]);
  });

  it('creates a span when the active parent is non-recording', () => {
    const startInactiveSpanSpy = vi.spyOn(SentryCore, 'startInactiveSpan');
    const connection = new EventEmitter();
    const request = Object.assign(new EventEmitter(), {
      sqlTextOrProcedure: 'SELECT 1',
      callback: vi.fn(),
    });

    withActiveSpan(new SentryCore.SentryNonRecordingSpan(), () => {
      tracingChannel(CHANNELS.TEDIOUS_EXEC_SQL).start.publish({ self: connection, arguments: [request] });
      request.callback();
    });

    expect(startInactiveSpanSpy).toHaveBeenCalledTimes(1);
    expect(request.eventNames()).toEqual([]);
    expect(connection.eventNames()).toEqual([]);
  });
});
