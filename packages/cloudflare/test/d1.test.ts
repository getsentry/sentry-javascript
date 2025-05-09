import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentD1WithSentry } from '../src/d1';

const MOCK_FIRST_RETURN_VALUE = { id: 1, name: 'Foo' };

const MOCK_RAW_RETURN_VALUE = [
  { id: 1, name: 'Foo' },
  { id: 2, name: 'Bar' },
];

const MOCK_D1_RESPONSE = {
  success: true,
  meta: {
    duration: 1,
    size_after: 2,
    rows_read: 3,
    rows_written: 4,
    last_row_id: 5,
    changed_db: false,
    changes: 7,
  },
};

describe('instrumentD1WithSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
  const addBreadcrumbSpy = vi.spyOn(SentryCore, 'addBreadcrumb');

  function createMockD1Statement(): D1PreparedStatement {
    return {
      bind: vi.fn().mockImplementation(createMockD1Statement),
      first: vi.fn().mockImplementation(() => Promise.resolve(MOCK_FIRST_RETURN_VALUE)),
      run: vi.fn().mockImplementation(() => Promise.resolve(MOCK_D1_RESPONSE)),
      all: vi.fn().mockImplementation(() => Promise.resolve(MOCK_D1_RESPONSE)),
      raw: vi.fn().mockImplementation(() => Promise.resolve(MOCK_RAW_RETURN_VALUE)),
    };
  }

  function createMockD1Database(): D1Database {
    return {
      prepare: vi.fn().mockImplementation(createMockD1Statement),
      dump: vi.fn(),
      batch: vi.fn(),
      exec: vi.fn(),
    };
  }

  describe('statement.first()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      const response = await instrumentedDb.prepare('SELECT * FROM users').first();
      expect(response).toEqual(MOCK_FIRST_RETURN_VALUE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').first();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'cloudflare.d1.query_type': 'first',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'SELECT * FROM users',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').first();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'SELECT * FROM users',
        data: {
          'cloudflare.d1.query_type': 'first',
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().first();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.run()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      const response = await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();
      expect(response).toEqual(MOCK_D1_RESPONSE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'cloudflare.d1.query_type': 'run',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'INSERT INTO users (name) VALUES (?)',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'INSERT INTO users (name) VALUES (?)',
        data: {
          'cloudflare.d1.query_type': 'run',
          'cloudflare.d1.duration': 1,
          'cloudflare.d1.rows_read': 3,
          'cloudflare.d1.rows_written': 4,
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().run();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.all()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      const response = await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();
      expect(response).toEqual(MOCK_D1_RESPONSE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').all();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'cloudflare.d1.query_type': 'all',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'INSERT INTO users (name) VALUES (?)',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').all();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'INSERT INTO users (name) VALUES (?)',
        data: {
          'cloudflare.d1.query_type': 'all',
          'cloudflare.d1.duration': 1,
          'cloudflare.d1.rows_read': 3,
          'cloudflare.d1.rows_written': 4,
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().all();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.raw()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      const response = await instrumentedDb.prepare('SELECT * FROM users').raw();
      expect(response).toEqual(MOCK_RAW_RETURN_VALUE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').raw();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'cloudflare.d1.query_type': 'raw',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'SELECT * FROM users',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').raw();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'SELECT * FROM users',
        data: {
          'cloudflare.d1.query_type': 'raw',
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().raw();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });
});
