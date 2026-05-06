import { SPAN_STATUS_ERROR } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// channels registry must be created before the vi.mock factory runs
const channels = vi.hoisted(() => ({}) as Record<string, { subs: Record<string, (data: any) => void> }>);

vi.mock('@sentry/opentelemetry/tracing-channel', () => ({
  tracingChannel: (name: string, _transform: unknown) => {
    const subs: Record<string, (data: any) => void> = {};
    channels[name] = { subs };
    return { subscribe: (s: Record<string, (data: any) => void>) => Object.assign(subs, s) };
  },
}));

import {
  _resetRedisDiagnosticChannelsForTesting,
  subscribeRedisDiagnosticChannels,
} from '../../../../src/integrations/tracing/redis/redis-dc-subscriber';

const CHANNEL_COMMAND = 'node-redis:command';
const CHANNEL_BATCH = 'node-redis:batch';
const CHANNEL_CONNECT = 'node-redis:connect';

const subs = (name: string) =>
  channels[name]?.subs as {
    asyncEnd: (data: any) => void;
    error: (data: any) => void;
  };

function makeSpan() {
  return {
    end: vi.fn(),
    setStatus: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    updateName: vi.fn(),
    spanContext: () => ({ spanId: 'test-span-id', traceId: 'test-trace-id', traceFlags: 1 }),
  };
}

describe('redis-dc-subscriber', () => {
  let mockSpan: ReturnType<typeof makeSpan>;
  let responseHook: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetRedisDiagnosticChannelsForTesting();
    mockSpan = makeSpan();
    responseHook = vi.fn();
    subscribeRedisDiagnosticChannels(responseHook);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('command channel', () => {
    describe('asyncEnd (success path)', () => {
      it('calls the response hook with sliced args and ends the span', () => {
        const data = {
          command: 'GET',
          args: ['GET', 'cache:key'],
          result: 'hit-value',
          _sentrySpan: mockSpan,
        };
        subs(CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).toHaveBeenCalledWith(mockSpan, 'GET', ['cache:key'], 'hit-value');
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('strips the command name from args before passing to the response hook', () => {
        const data = {
          command: 'MGET',
          args: ['MGET', 'key1', 'key2', 'key3'],
          result: ['v1', 'v2', 'v3'],
          _sentrySpan: mockSpan,
        };
        subs(CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).toHaveBeenCalledWith(mockSpan, 'MGET', ['key1', 'key2', 'key3'], ['v1', 'v2', 'v3']);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(CHANNEL_COMMAND).asyncEnd({ command: 'GET', args: ['GET', 'k'], result: 'v' });

        expect(responseHook).not.toHaveBeenCalled();
        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('ECONNREFUSED');
        const data = { command: 'SET', args: ['SET', 'k', 'v'], error, _sentrySpan: mockSpan };
        subs(CHANNEL_COMMAND).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'ECONNREFUSED' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not call the response hook or end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('ECONNREFUSED');
        const data = { command: 'GET', args: ['GET', 'k'], error, _sentrySpan: mockSpan };

        // TracingChannel fires error first, then asyncEnd, on the same data object
        subs(CHANNEL_COMMAND).error(data);
        subs(CHANNEL_COMMAND).asyncEnd(data);

        expect(responseHook).not.toHaveBeenCalled();
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early in error handler when _sentrySpan is absent', () => {
        subs(CHANNEL_COMMAND).error({ command: 'GET', args: ['GET', 'k'], error: new Error('x') });

        expect(mockSpan.setStatus).not.toHaveBeenCalled();
        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });
  });

  describe('batch channel', () => {
    describe('asyncEnd (success path)', () => {
      it('ends the span', () => {
        const data = { batchMode: 'PIPELINE', batchSize: 3, _sentrySpan: mockSpan };
        subs(CHANNEL_BATCH).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(CHANNEL_BATCH).asyncEnd({ batchMode: 'MULTI' });

        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('MULTI aborted');
        const data = { batchMode: 'MULTI', error, _sentrySpan: mockSpan };
        subs(CHANNEL_BATCH).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'MULTI aborted' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('MULTI aborted');
        const data = { batchMode: 'MULTI', error, _sentrySpan: mockSpan };

        subs(CHANNEL_BATCH).error(data);
        subs(CHANNEL_BATCH).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('connect channel', () => {
    describe('asyncEnd (success path)', () => {
      it('ends the span', () => {
        const data = { serverAddress: '127.0.0.1', serverPort: 6379, _sentrySpan: mockSpan };
        subs(CHANNEL_CONNECT).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('bails early when _sentrySpan is absent', () => {
        subs(CHANNEL_CONNECT).asyncEnd({ serverAddress: '127.0.0.1' });

        expect(mockSpan.end).not.toHaveBeenCalled();
      });
    });

    describe('error path', () => {
      it('sets error status and ends the span in the error handler', () => {
        const error = new Error('connect ECONNREFUSED');
        const data = { serverAddress: '127.0.0.1', serverPort: 6379, error, _sentrySpan: mockSpan };
        subs(CHANNEL_CONNECT).error(data);

        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_ERROR, message: 'connect ECONNREFUSED' });
        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });

      it('does not end the span a second time in asyncEnd when error is set', () => {
        const error = new Error('connect ECONNREFUSED');
        const data = { serverAddress: '127.0.0.1', error, _sentrySpan: mockSpan };

        subs(CHANNEL_CONNECT).error(data);
        subs(CHANNEL_CONNECT).asyncEnd(data);

        expect(mockSpan.end).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('subscribeRedisDiagnosticChannels', () => {
    it('is idempotent — does not re-subscribe if called again', () => {
      // subscribeRedisDiagnosticChannels was already called in beforeEach.
      // Calling again should not throw or overwrite subscribers.
      const secondHook = vi.fn();
      subscribeRedisDiagnosticChannels(secondHook);

      // The second hook should still be active (currentResponseHook is updated regardless)
      // but no new channel setup should occur.
      const data = { command: 'GET', args: ['GET', 'k'], result: 'v', _sentrySpan: mockSpan };
      subs(CHANNEL_COMMAND).asyncEnd(data);

      expect(secondHook).toHaveBeenCalledTimes(1);
      expect(responseHook).not.toHaveBeenCalled();
    });
  });
});
