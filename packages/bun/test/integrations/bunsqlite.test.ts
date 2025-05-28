import * as SentryCore from '@sentry/core';
import { beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { bunSqliteIntegration, _resetBunSqliteInstrumentation } from '../../src/integrations/bunsqlite';

describe('Bun SQLite Integration', () => {
  let startSpanSpy: any;
  let captureExceptionSpy: any;

  beforeAll(() => {
    startSpanSpy = spyOn(SentryCore, 'startSpan');
    captureExceptionSpy = spyOn(SentryCore, 'captureException');

    _resetBunSqliteInstrumentation();

    const integration = bunSqliteIntegration();
    integration.setupOnce();
  });

  beforeEach(() => {
    startSpanSpy.mockClear();
    captureExceptionSpy.mockClear();
  });

  test('has the correct name', () => {
    const integration = bunSqliteIntegration();
    expect(integration.name).toBe('BunSqlite');
  });

  describe('Database instrumentation', () => {
    test('instruments query method', () => {
      delete require.cache[require.resolve('bun:sqlite')];
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      startSpanSpy.mockClear();

      const sql = 'SELECT * FROM users';
      db.query(sql);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: sql,
          op: 'db.sql.query',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'query',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });

    test('instruments run method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

      const sql = 'INSERT INTO users (name) VALUES (?)';
      const params = ['John'];
      db.run(sql, ...params);

      // Reset after exec call
      startSpanSpy.mockClear();
      db.run(sql, ...params);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: sql,
          op: 'db.sql.run',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'run',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });

    test('instruments exec method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      const sql = 'CREATE TABLE users (id INTEGER PRIMARY KEY)';
      db.exec(sql);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: sql,
          op: 'db.sql.exec',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'exec',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });

    test('instruments transaction method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      startSpanSpy.mockClear();

      const fn = () => {
        db.run('INSERT INTO users (name) VALUES (?)', 'Alice');
      };
      db.transaction(fn)();

      expect(
        startSpanSpy.mock.calls.some(
          call => call[0].name === 'db.sql.transaction' && call[0].op === 'db.sql.transaction',
        ),
      ).toBe(true);
    });

    test('instruments prepare method and returns instrumented statement', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      startSpanSpy.mockClear();

      const sql = 'SELECT * FROM users WHERE id = ?';
      const statement = db.prepare(sql);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: sql,
          op: 'db.sql.prepare',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'prepare',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );

      startSpanSpy.mockClear();
      statement.run(1);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: 'db.statement.run',
          op: 'db.sql.statement.run',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'run',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });
  });

  describe('Statement instrumentation', () => {
    test('instruments statement get method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      db.run('INSERT INTO users (id, name) VALUES (1, "John")');

      const sql = 'SELECT * FROM users WHERE id = ?';
      const statement = db.prepare(sql);

      startSpanSpy.mockClear();
      statement.get(1);

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: 'db.statement.get',
          op: 'db.sql.statement.get',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'get',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });

    test('instruments statement all method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      db.run('INSERT INTO users (name) VALUES ("John"), ("Jane")');

      const sql = 'SELECT * FROM users';
      const statement = db.prepare(sql);

      startSpanSpy.mockClear();
      statement.all();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: 'db.statement.all',
          op: 'db.sql.statement.all',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'all',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });

    test('instruments statement values method', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      db.run('INSERT INTO users (name) VALUES ("John"), ("Jane")');

      const sql = 'SELECT id FROM users';
      const statement = db.prepare(sql);

      startSpanSpy.mockClear();
      statement.values();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        {
          name: 'db.statement.values',
          op: 'db.sql.statement.values',
          attributes: {
            'sentry.origin': 'auto.db.bun.sqlite',
            'db.system': 'sqlite',
            'db.operation': 'values',
            'db.statement': sql,
            'db.name': ':memory:',
          },
        },
        expect.any(Function),
      );
    });
  });

  describe('Error handling', () => {
    test('captures exceptions and sets span status on error', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      captureExceptionSpy.mockClear();

      expect(() => db.query('SELECT * FROM invalid_table')).toThrow();

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(expect.any(Error), {
        mechanism: {
          type: 'bun.sqlite',
          handled: false,
          data: {
            function: 'query',
          },
        },
      });
    });

    test('captures exceptions from statement methods', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
      const statement = db.prepare('INSERT INTO users VALUES (?)');

      captureExceptionSpy.mockClear();

      statement.run(1);
      expect(() => statement.run(1)).toThrow();

      expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
      expect(captureExceptionSpy).toHaveBeenLastCalledWith(expect.any(Error), {
        mechanism: {
          type: 'bun.sqlite.statement',
          handled: false,
          data: {
            function: 'run',
          },
        },
      });
    });
  });

  describe('Edge cases', () => {
    test('handles databases without optional methods gracefully', () => {
      const { Database } = require('bun:sqlite');
      const db = new Database(':memory:');

      expect(() => {
        db.query('SELECT 1');
        db.exec('CREATE TABLE test (id INTEGER)');
      }).not.toThrow();
    });

    test('multiple database instances are instrumented independently', () => {
      const { Database } = require('bun:sqlite');
      const db1 = new Database(':memory:');
      const db2 = new Database(':memory:');

      db1.exec('CREATE TABLE test1 (id INTEGER)');
      db2.exec('CREATE TABLE test2 (id INTEGER)');

      startSpanSpy.mockClear();

      db1.query('SELECT * FROM test1');
      db2.query('SELECT * FROM test2');

      expect(startSpanSpy).toHaveBeenCalledTimes(2);
      expect(startSpanSpy.mock.calls[0]?.[0]?.attributes?.['db.statement']).toBe('SELECT * FROM test1');
      expect(startSpanSpy.mock.calls[1]?.[0]?.attributes?.['db.statement']).toBe('SELECT * FROM test2');
    });
  });
});
