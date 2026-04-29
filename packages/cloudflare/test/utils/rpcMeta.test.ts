import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appendRpcMeta, extractRpcMeta } from '../../src/utils/rpcMeta';

describe('rpcMeta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('appendRpcMeta', () => {
    it('appends meta with trace data when active trace exists', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const result = appendRpcMeta(['arg1', 42]);

      expect(result).toEqual([
        'arg1',
        42,
        {
          __sentry_rpc_meta__: {
            'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
            baggage: 'sentry-environment=production',
          },
        },
      ]);
    });

    it('returns original args when no active trace', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({});

      const args = ['arg1', 'arg2'];
      const result = appendRpcMeta(args);

      expect(result).toBe(args);
    });

    it('returns original args when sentry-trace is empty', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({ 'sentry-trace': '' });

      const args = ['arg1'];
      const result = appendRpcMeta(args);

      expect(result).toBe(args);
    });

    it('appends meta to empty args', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': 'abc-def-1',
        baggage: 'sentry-sample_rate=1.0',
      });

      const result = appendRpcMeta([]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        __sentry_rpc_meta__: { 'sentry-trace': 'abc-def-1', baggage: 'sentry-sample_rate=1.0' },
      });
    });

    it('does not mutate original args array', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': 'abc-def-1',
      });

      const args = ['arg1'];
      appendRpcMeta(args);

      expect(args).toEqual(['arg1']);
    });
  });

  describe('extractRpcMeta', () => {
    it('extracts meta from trailing argument', () => {
      const args = [
        'arg1',
        42,
        {
          __sentry_rpc_meta__: {
            'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
            baggage: 'sentry-environment=production',
          },
        },
      ];

      const result = extractRpcMeta(args);

      expect(result.args).toEqual(['arg1', 42]);
      expect(result.rpcMeta).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });
    });

    it('returns original args when no meta present', () => {
      const args = ['arg1', { someKey: 'value' }];

      const result = extractRpcMeta(args);

      expect(result.args).toEqual(['arg1', { someKey: 'value' }]);
      expect(result.rpcMeta).toBeUndefined();
    });

    it('returns empty args unchanged', () => {
      const result = extractRpcMeta([]);

      expect(result.args).toEqual([]);
      expect(result.rpcMeta).toBeUndefined();
    });

    it('does not extract if __sentry_rpc_meta__ value is not an object', () => {
      const args = ['arg1', { __sentry_rpc_meta__: 'not-an-object' }];

      const result = extractRpcMeta(args);

      expect(result.args).toEqual(args);
      expect(result.rpcMeta).toBeUndefined();
    });

    it('does not extract if __sentry_rpc_meta__ value is null', () => {
      const args = ['arg1', { __sentry_rpc_meta__: null }];

      const result = extractRpcMeta(args);

      expect(result.args).toEqual(args);
      expect(result.rpcMeta).toBeUndefined();
    });

    it('handles meta with only trace (no baggage)', () => {
      const args = [{ __sentry_rpc_meta__: { 'sentry-trace': 'abc-def-1' } }];

      const result = extractRpcMeta(args);

      expect(result.args).toEqual([]);
      expect(result.rpcMeta).toEqual({ 'sentry-trace': 'abc-def-1' });
    });

    it('round-trips with appendRpcMeta', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const originalArgs = ['hello', { data: true }, 42];
      const withMeta = appendRpcMeta(originalArgs);
      const { args, rpcMeta } = extractRpcMeta(withMeta);

      expect(args).toEqual(originalArgs);
      expect(rpcMeta).toEqual({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });
    });
  });
});
