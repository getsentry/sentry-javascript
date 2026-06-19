import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import * as sentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instrumentSqlStorage } from '../src/instrumentations/instrumentSqlStorage';

describe('instrumentSqlStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('instruments exec with summary as span name and sanitized query as db.query.text', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users WHERE id = ?', 42);

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'SELECT * FROM users WHERE id = ?',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'SELECT * FROM users WHERE id = ?',
          'cloudflare.durable_object.query.bindings': 1,
        },
      },
      expect.any(Function),
    );
  });

  it('sanitizes embedded literals in db.query.text', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec("SELECT * FROM users WHERE name = 'Alice' AND age > 30");

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'SELECT * FROM users WHERE name = ? AND age > ?',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'SELECT * FROM users WHERE name = ? AND age > ?',
          'cloudflare.durable_object.query.bindings': 0,
        },
      },
      expect.any(Function),
    );
  });

  it('passes bindings through to the original exec', () => {
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users WHERE id = ?', 42);

    expect(mockSql.exec).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', 42);
  });

  it('tracks binding count in span attributes', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('INSERT INTO users (name, email) VALUES (?, ?)', 'Alice', 'alice@example.com');

    expect(startSpanSpy).toHaveBeenCalledWith(
      {
        op: 'db.query',
        name: 'INSERT INTO users (name, email) VALUES (?, ?)',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.cloudflare.durable_object.sql',
          'db.system.name': 'cloudflare-durable-object-sql',
          'db.operation.name': 'exec',
          'db.query.text': 'INSERT INTO users (name, email) VALUES (?, ?)',
          'cloudflare.durable_object.query.bindings': 2,
        },
      },
      expect.any(Function),
    );
  });

  it('returns the cursor from exec', () => {
    const mockCursor = createMockCursor();
    const mockSql = createMockSqlStorage(mockCursor);
    const instrumented = instrumentSqlStorage(mockSql);

    const result = instrumented.exec('SELECT 1');

    expect(result).toBe(mockCursor);
  });

  it('adds a breadcrumb with the sanitized query', () => {
    const addBreadcrumbSpy = vi.spyOn(sentryCore, 'addBreadcrumb');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT * FROM users');

    expect(addBreadcrumbSpy).toHaveBeenCalledWith({
      category: 'query',
      message: 'SELECT * FROM users',
    });
  });

  it('does not instrument non-exec properties', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    expect(instrumented.databaseSize).toBe(1024);
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('preserves native getter this binding through the proxy', () => {
    class BrandCheckedSql {
      #internal = 1024;
      get databaseSize() {
        return this.#internal;
      }
      exec = vi.fn().mockReturnValue(createMockCursor());
    }

    const sql = new BrandCheckedSql();
    const instrumented = instrumentSqlStorage(sql as any);

    expect(instrumented.databaseSize).toBe(1024);
  });

  it('propagates errors from exec', () => {
    const mockSql = createMockSqlStorage();
    mockSql.exec = vi.fn().mockImplementation(() => {
      throw new Error('SQL error');
    });
    const instrumented = instrumentSqlStorage(mockSql);

    expect(() => instrumented.exec('INVALID SQL')).toThrow('SQL error');
  });

  it('creates a span for each exec call', () => {
    const startSpanSpy = vi.spyOn(sentryCore, 'startSpan');
    const mockSql = createMockSqlStorage();
    const instrumented = instrumentSqlStorage(mockSql);

    instrumented.exec('SELECT 1');
    instrumented.exec('SELECT 2');

    expect(startSpanSpy).toHaveBeenCalledTimes(2);
    expect(mockSql.exec).toHaveBeenCalledTimes(2);
  });
});

function createMockCursor() {
  return {
    next: vi.fn(),
    toArray: vi.fn().mockReturnValue([]),
    one: vi.fn(),
    raw: vi.fn(),
    columnNames: [],
    rowsRead: 0,
    rowsWritten: 0,
  };
}

function createMockSqlStorage(cursor?: ReturnType<typeof createMockCursor>): any {
  return {
    exec: vi.fn().mockReturnValue(cursor ?? createMockCursor()),
    databaseSize: 1024,
    Cursor: class {},
    Statement: class {},
  };
}
