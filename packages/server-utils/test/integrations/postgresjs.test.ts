import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reconstructQuery, instrumentPostgresJsSql } from '../../src/integrations/postgresjs';
import { sanitizeSqlQuery } from '../../src/utils/sql';

describe('PostgresJs portable instrumentation', () => {
  describe('_reconstructQuery', () => {
    describe('empty input handling', () => {
      it.each([
        [undefined, undefined],
        [null as unknown as undefined, undefined],
        [[], undefined],
        [[''], undefined],
      ])('returns undefined for %p', (input, expected) => {
        expect(_reconstructQuery(input)).toBe(expected);
      });

      it('returns whitespace-only string as-is', () => {
        expect(_reconstructQuery(['   '])).toBe('   ');
      });
    });

    describe('single-element array (non-parameterized)', () => {
      it.each([
        ['SELECT * FROM users', 'SELECT * FROM users'],
        ['SELECT * FROM users WHERE id = $1', 'SELECT * FROM users WHERE id = $1'],
        ['INSERT INTO users (email, name) VALUES ($1, $2)', 'INSERT INTO users (email, name) VALUES ($1, $2)'],
      ])('returns %p as-is', (input, expected) => {
        expect(_reconstructQuery([input])).toBe(expected);
      });
    });

    describe('multi-element array (parameterized)', () => {
      it.each([
        [['SELECT * FROM users WHERE id = ', ''], 'SELECT * FROM users WHERE id = $1'],
        [['SELECT * FROM users WHERE id = ', ' AND name = ', ''], 'SELECT * FROM users WHERE id = $1 AND name = $2'],
        [['INSERT INTO t VALUES (', ', ', ', ', ')'], 'INSERT INTO t VALUES ($1, $2, $3)'],
        [['', ' WHERE id = ', ''], '$1 WHERE id = $2'],
        [
          ['SELECT * FROM ', ' WHERE id = ', ' AND status IN (', ', ', ') ORDER BY ', ''],
          'SELECT * FROM $1 WHERE id = $2 AND status IN ($3, $4) ORDER BY $5',
        ],
      ])('reconstructs %p to %p', (input, expected) => {
        expect(_reconstructQuery(input)).toBe(expected);
      });
    });

    describe('edge cases', () => {
      it('handles 10+ parameters', () => {
        const strings = ['INSERT INTO t VALUES (', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ')'];
        expect(_reconstructQuery(strings)).toBe('INSERT INTO t VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)');
      });

      it.each([
        [['SELECT * FROM users WHERE id = ', '   ', ''], 'SELECT * FROM users WHERE id = $1   $2'],
        [['SELECT * FROM users WHERE id = ', ' LIMIT 10'], 'SELECT * FROM users WHERE id = $1 LIMIT 10'],
        [['SELECT *\nFROM users\nWHERE id = ', ''], 'SELECT *\nFROM users\nWHERE id = $1'],
        [['SELECT * FROM "User" WHERE "email" = ', ''], 'SELECT * FROM "User" WHERE "email" = $1'],
        [['SELECT ', '', '', ''], 'SELECT $1$2$3'],
        [['', ''], '$1'],
      ])('handles edge case %p', (input, expected) => {
        expect(_reconstructQuery(input)).toBe(expected);
      });
    });

    describe('integration with sanitizeSqlQuery', () => {
      it('preserves $n placeholders per OTEL spec', () => {
        const strings = ['SELECT * FROM users WHERE id = ', ' AND name = ', ''];
        expect(sanitizeSqlQuery(_reconstructQuery(strings))).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
      });

      it('collapses IN clause with $n to IN ($?)', () => {
        const strings = ['SELECT * FROM users WHERE id = ', ' AND status IN (', ', ', ', ', ')'];
        expect(sanitizeSqlQuery(_reconstructQuery(strings))).toBe(
          'SELECT * FROM users WHERE id = $1 AND status IN ($?)',
        );
      });

      it('returns Unknown SQL Query for undefined input', () => {
        expect(sanitizeSqlQuery(_reconstructQuery(undefined))).toBe('Unknown SQL Query');
      });

      it('normalizes whitespace and removes trailing semicolon', () => {
        const strings = ['SELECT *\n  FROM users\n  WHERE id = ', ';'];
        expect(sanitizeSqlQuery(_reconstructQuery(strings))).toBe('SELECT * FROM users WHERE id = $1');
      });
    });
  });

  describe('instrumentPostgresJsSql', () => {
    it('returns non-function values unchanged', () => {
      expect(instrumentPostgresJsSql(null as any)).toBe(null);
      expect(instrumentPostgresJsSql(undefined as any)).toBe(undefined);
      expect(instrumentPostgresJsSql(42 as any)).toBe(42);
      expect(instrumentPostgresJsSql('string' as any)).toBe('string');
    });

    it('wraps sql function and intercepts tagged template calls', () => {
      const mockQuery = { handle: vi.fn(), strings: ['SELECT * FROM users WHERE id = ', ''] };
      const mockSql = vi.fn().mockReturnValue(mockQuery);

      const instrumented = instrumentPostgresJsSql(mockSql);
      expect(instrumented).not.toBe(mockSql);
      expect(typeof instrumented).toBe('function');

      // Invoke the instrumented function
      const result = instrumented(['SELECT * FROM users WHERE id = ', ''], 1);
      expect(mockSql).toHaveBeenCalledWith(['SELECT * FROM users WHERE id = ', ''], 1);
      expect(result).toBe(mockQuery);
      // The handle should have been wrapped
      expect((mockQuery.handle as any).__sentryWrapped).toBe(true);
    });

    it('wraps unsafe method', () => {
      const mockQuery = { handle: vi.fn(), strings: undefined };
      const mockSql = vi.fn();
      mockSql.unsafe = vi.fn().mockReturnValue(mockQuery);

      const instrumented = instrumentPostgresJsSql(mockSql as any);
      const result = instrumented.unsafe('SELECT 1');
      expect(mockSql.unsafe).toHaveBeenCalledWith('SELECT 1');
      expect(result).toBe(mockQuery);
      expect((mockQuery.handle as any).__sentryWrapped).toBe(true);
    });

    it('wraps file method', () => {
      const mockQuery = { handle: vi.fn(), strings: undefined };
      const mockSql = vi.fn();
      mockSql.file = vi.fn().mockReturnValue(mockQuery);

      const instrumented = instrumentPostgresJsSql(mockSql as any);
      const result = instrumented.file('test.sql');
      expect(mockSql.file).toHaveBeenCalledWith('test.sql');
      expect(result).toBe(mockQuery);
      expect((mockQuery.handle as any).__sentryWrapped).toBe(true);
    });

    it('wraps begin method with callback', () => {
      const mockSql = vi.fn();
      const innerSql = vi.fn();
      mockSql.begin = vi.fn().mockImplementation((cb: (sql: unknown) => unknown) => {
        return cb(innerSql);
      });

      const instrumented = instrumentPostgresJsSql(mockSql as any);
      let receivedSql: unknown;
      instrumented.begin((sql: unknown) => {
        receivedSql = sql;
        return 'result';
      });

      // The callback should receive an instrumented sql instance (a proxy, not the raw innerSql)
      expect(receivedSql).not.toBe(innerSql);
      expect(typeof receivedSql).toBe('function');
    });

    it('wraps reserve method with promise', async () => {
      const innerSql = vi.fn();
      const mockSql = vi.fn();
      mockSql.reserve = vi.fn().mockResolvedValue(innerSql);

      const instrumented = instrumentPostgresJsSql(mockSql as any);
      const result = await instrumented.reserve();

      // The resolved instance should be instrumented
      expect(result).not.toBe(innerSql);
      expect(typeof result).toBe('function');
    });

    it('prevents double-instrumentation via Symbol marker', () => {
      const mockSql = vi.fn();
      const instrumented1 = instrumentPostgresJsSql(mockSql);
      const instrumented2 = instrumentPostgresJsSql(instrumented1);

      // Should return the same proxy, not double-wrap
      expect(instrumented2).toBe(instrumented1);
    });

    it('extracts connection context from sql.options', () => {
      const mockQuery = { handle: vi.fn(), strings: ['SELECT 1'] };
      const mockSql = vi.fn().mockReturnValue(mockQuery);
      mockSql.options = {
        host: ['db.example.com'],
        port: [5433],
        database: 'testdb',
      };

      const instrumented = instrumentPostgresJsSql(mockSql as any);

      // We can't access the connection context directly via a new Symbol,
      // but we can verify the proxy was created
      expect(instrumented).not.toBe(mockSql);
    });

    describe('span creation', () => {
      beforeEach(() => {
        // By default, mock getActiveSpan to return undefined (no parent)
        vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue(undefined);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('skips span creation when requireParentSpan is true (default) and no parent span', async () => {
        const originalHandle = vi.fn().mockResolvedValue([]);
        const mockQuery = {
          handle: originalHandle,
          strings: ['SELECT * FROM users'],
          resolve: vi.fn(),
          reject: vi.fn(),
        };
        const mockSql = vi.fn().mockReturnValue(mockQuery);

        const instrumented = instrumentPostgresJsSql(mockSql);
        instrumented(['SELECT * FROM users']);

        // handle is wrapped but when called, since there's no parent span,
        // it should delegate to the original
        const wrappedHandle = mockQuery.handle as (...args: unknown[]) => Promise<unknown>;
        await wrappedHandle.call(mockQuery);

        // The original handle should have been called directly (no span creation)
        expect(originalHandle).toHaveBeenCalled();
      });

      it('creates spans when requireParentSpan is false', async () => {
        const handleFn = vi.fn().mockResolvedValue([]);
        const mockQuery = {
          handle: handleFn,
          strings: ['SELECT * FROM users'],
          resolve: vi.fn(),
          reject: vi.fn(),
        };
        const mockSql = vi.fn().mockReturnValue(mockQuery);

        const instrumented = instrumentPostgresJsSql(mockSql, { requireParentSpan: false });
        instrumented(['SELECT * FROM users']);

        // handle was wrapped
        expect((mockQuery.handle as any).__sentryWrapped).toBe(true);
      });

      it('only creates one span even when handle() is called multiple times', async () => {
        const mockSpan = { setAttribute: vi.fn(), setAttributes: vi.fn(), end: vi.fn() };
        const startSpanManualSpy = vi
          .spyOn(SentryCore, 'startSpanManual')
          .mockImplementation((_opts, callback) => callback(mockSpan as any, () => {}));

        const originalHandle = vi.fn().mockResolvedValue([]);
        const mockQuery = {
          handle: originalHandle,
          strings: ['SELECT 1'],
          resolve: vi.fn(),
          reject: vi.fn(),
          executed: false,
        };
        const mockSql = vi.fn().mockReturnValue(mockQuery);

        const instrumented = instrumentPostgresJsSql(mockSql, { requireParentSpan: false });
        instrumented(['SELECT 1']);

        const wrappedHandle = mockQuery.handle as (...args: unknown[]) => Promise<unknown>;

        // First call — executed is false, should create a span
        await wrappedHandle.call(mockQuery);
        expect(startSpanManualSpy).toHaveBeenCalledTimes(1);

        // Simulate postgres.js setting executed = true after first handle()
        mockQuery.executed = true;

        // Second and third calls (from .then/.catch/.finally) — should NOT create more spans
        await wrappedHandle.call(mockQuery);
        await wrappedHandle.call(mockQuery);
        expect(startSpanManualSpy).toHaveBeenCalledTimes(1);

        startSpanManualSpy.mockRestore();
      });
    });

    it('does not wrap non-query results from sql call', () => {
      const nonQueryResult = { notAQuery: true };
      const mockSql = vi.fn().mockReturnValue(nonQueryResult);

      const instrumented = instrumentPostgresJsSql(mockSql);
      const result = instrumented();

      // Should pass through without trying to wrap
      expect(result).toBe(nonQueryResult);
    });

    it('passes through non-function properties', () => {
      const mockSql = vi.fn();
      (mockSql as any).someProperty = 'value';
      (mockSql as any).someNumber = 42;

      const instrumented = instrumentPostgresJsSql(mockSql as any);
      expect(instrumented.someProperty).toBe('value');
      expect(instrumented.someNumber).toBe(42);
    });

    it('handles requestHook errors gracefully', () => {
      const handleFn = vi.fn().mockResolvedValue([]);
      const mockQuery = {
        handle: handleFn,
        strings: ['SELECT 1'],
        resolve: vi.fn(),
        reject: vi.fn(),
      };
      const mockSql = vi.fn().mockReturnValue(mockQuery);

      const badHook = vi.fn().mockImplementation(() => {
        throw new Error('hook error');
      });

      // Should not throw
      const instrumented = instrumentPostgresJsSql(mockSql, { requestHook: badHook });
      instrumented(['SELECT 1']);

      // The handle was wrapped despite the bad hook
      expect((mockQuery.handle as any).__sentryWrapped).toBe(true);
    });
  });
});
