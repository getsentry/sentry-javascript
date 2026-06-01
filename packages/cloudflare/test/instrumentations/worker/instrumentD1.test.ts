import type { D1Database, D1DatabaseSession, D1PreparedStatement } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { instrumentD1, instrumentD1WithSentry } from '../../../src/instrumentations/worker/instrumentD1';

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

function createMockD1Statement(query?: string): D1PreparedStatement {
  return {
    statement: query,
    bind: vi.fn().mockImplementation(() => createMockD1Statement(query)),
    first: vi.fn().mockImplementation(() => Promise.resolve(MOCK_FIRST_RETURN_VALUE)),
    run: vi.fn().mockImplementation(() => Promise.resolve(MOCK_D1_RESPONSE)),
    all: vi.fn().mockImplementation(() => Promise.resolve(MOCK_D1_RESPONSE)),
    raw: vi.fn().mockImplementation(() => Promise.resolve(MOCK_RAW_RETURN_VALUE)),
  } as unknown as D1PreparedStatement;
}

function createMockD1Database(): D1Database {
  return {
    prepare: vi.fn().mockImplementation((query: string) => createMockD1Statement(query)),
    dump: vi.fn(),
    batch: vi.fn().mockResolvedValue([MOCK_D1_RESPONSE]),
    exec: vi.fn().mockResolvedValue({ count: 1, duration: 0.5 }),
    withSession: vi.fn().mockImplementation(() => createMockD1Session()),
  } as unknown as D1Database;
}

function createMockD1Session(): D1DatabaseSession {
  return {
    prepare: vi.fn().mockImplementation((query: string) => createMockD1Statement(query)),
    batch: vi.fn().mockResolvedValue([MOCK_D1_RESPONSE]),
    getBookmark: vi.fn().mockReturnValue(null),
  } as unknown as D1DatabaseSession;
}

describe('instrumentD1WithSentry (deprecated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('still instruments the database', async () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    const instrumentedDb = instrumentD1WithSentry(createMockD1Database());
    await instrumentedDb.prepare('SELECT 1').first();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
  });
});

describe('instrumentD1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
  const addBreadcrumbSpy = vi.spyOn(SentryCore, 'addBreadcrumb');

  describe('statement.first()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.prepare('SELECT * FROM users').first();
      expect(response).toEqual(MOCK_FIRST_RETURN_VALUE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').first();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'first',
            'db.query.text': 'SELECT * FROM users',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'SELECT * FROM users',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').first();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'SELECT * FROM users',
        data: {
          'db.operation.name': 'first',
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().first();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.run()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();
      expect(response).toEqual(MOCK_D1_RESPONSE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'run',
            'db.query.text': 'INSERT INTO users (name) VALUES (?)',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'INSERT INTO users (name) VALUES (?)',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').run();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'INSERT INTO users (name) VALUES (?)',
        data: {
          'db.operation.name': 'run',
          'cloudflare.d1.duration': 1,
          'cloudflare.d1.rows_read': 3,
          'cloudflare.d1.rows_written': 4,
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().run();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.all()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.prepare('SELECT * FROM users').all();
      expect(response).toEqual(MOCK_D1_RESPONSE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').all();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'all',
            'db.query.text': 'INSERT INTO users (name) VALUES (?)',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'INSERT INTO users (name) VALUES (?)',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('INSERT INTO users (name) VALUES (?)').all();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'INSERT INTO users (name) VALUES (?)',
        data: {
          'db.operation.name': 'all',
          'cloudflare.d1.duration': 1,
          'cloudflare.d1.rows_read': 3,
          'cloudflare.d1.rows_written': 4,
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().all();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('statement.raw()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.prepare('SELECT * FROM users').raw();
      expect(response).toEqual(MOCK_RAW_RETURN_VALUE);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').raw();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'raw',
            'db.query.text': 'SELECT * FROM users',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'SELECT * FROM users',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').raw();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'SELECT * FROM users',
        data: {
          'db.operation.name': 'raw',
        },
      });
    });

    test('works with statement.bind()', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.prepare('SELECT * FROM users').bind().raw();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('db.batch()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.batch([instrumentedDb.prepare('SELECT 1')]);
      expect(response).toEqual([MOCK_D1_RESPONSE]);
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.batch([instrumentedDb.prepare('SELECT 1'), instrumentedDb.prepare('SELECT 2')]);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'batch',
            'db.query.text': 'SELECT 1\nSELECT 2',
            'db.operation.batch.size': 2,
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'D1 batch',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.batch([instrumentedDb.prepare('SELECT 1')]);

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'D1 batch',
        data: {
          'db.operation.name': 'batch',
        },
      });
    });
  });

  describe('db.exec()', () => {
    test('does not change return value', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const response = await instrumentedDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
      expect(response).toEqual({ count: 1, duration: 0.5 });
    });

    test('instruments with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'exec',
            'db.query.text': 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      await instrumentedDb.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
        data: {
          'db.operation.name': 'exec',
        },
      });
    });
  });

  describe('db.withSession()', () => {
    test('instruments session.prepare with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const session = (instrumentedDb as unknown as { withSession: () => D1DatabaseSession }).withSession();
      await session.prepare('SELECT * FROM users').first();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'first',
            'db.query.text': 'SELECT * FROM users',
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'SELECT * FROM users',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments session.prepare with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const session = (instrumentedDb as unknown as { withSession: () => D1DatabaseSession }).withSession();
      await session.prepare('SELECT * FROM users').first();

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'SELECT * FROM users',
        data: {
          'db.operation.name': 'first',
        },
      });
    });

    test('instruments session.batch with spans', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const session = (instrumentedDb as unknown as { withSession: () => D1DatabaseSession }).withSession();
      await session.batch([session.prepare('SELECT 1'), session.prepare('SELECT 2')]);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          attributes: {
            'db.system.name': 'cloudflare-d1',
            'db.operation.name': 'batch',
            'db.query.text': 'SELECT 1\nSELECT 2',
            'db.operation.batch.size': 2,
            'sentry.origin': 'auto.db.cloudflare.d1',
          },
          name: 'D1 batch',
          op: 'db.query',
        },
        expect.any(Function),
      );
    });

    test('instruments session.batch with breadcrumbs', async () => {
      const instrumentedDb = instrumentD1(createMockD1Database());
      const session = (instrumentedDb as unknown as { withSession: () => D1DatabaseSession }).withSession();
      await session.batch([session.prepare('SELECT 1')]);

      expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
      expect(addBreadcrumbSpy).toHaveBeenLastCalledWith({
        category: 'query',
        message: 'D1 batch',
        data: {
          'db.operation.name': 'batch',
        },
      });
    });
  });

  describe('double instrumentation prevention', () => {
    test('does not double-instrument the same database', async () => {
      const db = createMockD1Database();
      const first = instrumentD1(db);
      const prepareAfterFirst = first.prepare;

      const second = instrumentD1(db);

      expect(first).toBe(second);
      expect(second.prepare).toBe(prepareAfterFirst);
    });

    test('does not double-instrument when instrumentD1WithSentry is also used', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const db = createMockD1Database();
      const fromEnv = instrumentD1(db);
      const prepareAfterFirst = fromEnv.prepare;

      const fromManual = instrumentD1WithSentry(db);

      expect(fromEnv).toBe(fromManual);
      expect(fromManual.prepare).toBe(prepareAfterFirst);
    });
  });
});
