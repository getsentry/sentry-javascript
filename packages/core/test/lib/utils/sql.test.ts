import { describe, expect, it } from 'vitest';
import { getSqlQuerySummary } from '../../../src/utils/sql';

describe('getSqlQuerySummary', () => {
  it.each([undefined, ''])('returns undefined for %j', input => {
    expect(getSqlQuerySummary(input)).toBeUndefined();
  });

  describe('SELECT', () => {
    it.each([
      ['SELECT * FROM users WHERE id = ?', 'SELECT users'],
      ['select count(*) from orders', 'select orders'],
      ['SELECT DISTINCT email FROM subscribers WHERE active = ?', 'SELECT subscribers'],
      ['  SELECT * FROM users', 'SELECT users'],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it('returns just the operation for queries without FROM', () => {
      expect(getSqlQuerySummary('SELECT 1')).toBe('SELECT');
      expect(getSqlQuerySummary('SELECT CURRENT_TIMESTAMP')).toBe('SELECT');
    });

    it('captures multiple tables from JOINs', () => {
      expect(getSqlQuerySummary('SELECT u.name FROM users u JOIN posts p ON u.id = p.user_id')).toBe(
        'SELECT users posts',
      );
      expect(
        getSqlQuerySummary(
          'SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN products p ON o.product_id = p.id',
        ),
      ).toBe('SELECT orders customers products');
    });

    it('preserves original case of identifiers', () => {
      expect(getSqlQuerySummary('SELECT * FROM UserTable')).toBe('SELECT UserTable');
      expect(getSqlQuerySummary('select * from MyOrders')).toBe('select MyOrders');
    });

    it.each([
      ['SELECT * FROM t1 JOIN t2 USING (id) LEFT JOIN t3 USING (id)', 'SELECT t1 t2 t3'],
      ['SELECT * FROM colors CROSS JOIN sizes', 'SELECT colors sizes'],
      ['SELECT * FROM employees NATURAL JOIN departments', 'SELECT employees departments'],
    ])('handles various JOIN types: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it.each([['SELECT * FROM t1, t2, t3, t4, t5 WHERE t1.id = t2.t1_id', 'SELECT t1 t2 t3 t4 t5']])(
      'handles implicit joins: %j => %j',
      (input, expected) => {
        expect(getSqlQuerySummary(input)).toBe(expected);
      },
    );

    it.each([
      [
        'SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM users WHERE active = ?) AS l1) AS l2) AS l3',
        'SELECT SELECT SELECT SELECT users',
      ],
    ])('handles nested subqueries: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('INSERT', () => {
    it.each([
      ['INSERT INTO users (name, email) VALUES (?, ?)', 'INSERT users'],
      ['insert into orders (product_id) values (?)', 'insert orders'],
    ])('strips INTO: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it('captures INSERT...SELECT with both targets', () => {
      expect(getSqlQuerySummary('INSERT INTO shipping_details SELECT * FROM orders')).toBe(
        'INSERT shipping_details SELECT orders',
      );
    });
  });

  describe('UPDATE', () => {
    it.each([
      ['UPDATE users SET name = ? WHERE id = ?', 'UPDATE users'],
      ['update orders SET status = ? WHERE created_at < ?', 'update orders'],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('DELETE', () => {
    it.each([
      ['DELETE FROM users WHERE id = ?', 'DELETE users'],
      ['delete from sessions WHERE expired_at < ?', 'delete sessions'],
    ])('strips FROM: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('DDL', () => {
    it.each([
      ['CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)', 'CREATE TABLE users'],
      ['CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)', 'CREATE TABLE users'],
      ['ALTER TABLE users ADD COLUMN email TEXT', 'ALTER TABLE users'],
      ['DROP TABLE users', 'DROP TABLE users'],
      ['DROP TABLE IF EXISTS users', 'DROP TABLE users'],
      ['CREATE INDEX idx_name ON users (name)', 'CREATE INDEX idx_name'],
      ['CREATE INDEX IF NOT EXISTS idx_name ON users (name)', 'CREATE INDEX idx_name'],
      ['DROP INDEX idx_name', 'DROP INDEX idx_name'],
      ['DROP INDEX IF EXISTS idx_name', 'DROP INDEX idx_name'],
    ])('preserves DDL keywords: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it('preserves original case of DDL operations', () => {
      expect(getSqlQuerySummary('create table events (id INTEGER)')).toBe('create table events');
      expect(getSqlQuerySummary('Drop Table IF EXISTS temp')).toBe('Drop Table temp');
    });
  });

  describe('PRAGMA', () => {
    it.each([
      ['PRAGMA table_info(users)', 'PRAGMA table_info'],
      ['PRAGMA journal_mode', 'PRAGMA journal_mode'],
      ['PRAGMA table_list', 'PRAGMA table_list'],
      ['PRAGMA index_info(idx_name)', 'PRAGMA index_info'],
      ['pragma foreign_keys', 'pragma foreign_keys'],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('fallback', () => {
    it('extracts the first keyword for unrecognized statements', () => {
      expect(getSqlQuerySummary('EXPLAIN SELECT * FROM users')).toBe('EXPLAIN');
      expect(getSqlQuerySummary('VACUUM')).toBe('VACUUM');
      expect(getSqlQuerySummary('ANALYZE users')).toBe('ANALYZE');
    });

    it('handles leading whitespace in fallback', () => {
      expect(getSqlQuerySummary('  VACUUM')).toBe('VACUUM');
    });
  });

  describe('set operations', () => {
    it.each([
      ['select col from table1 union select col from table2', 'select table1 select table2'],
      [
        'SELECT * FROM users UNION ALL SELECT * FROM contractors UNION SELECT * FROM vendors',
        'SELECT users SELECT contractors SELECT vendors',
      ],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('subqueries in WHERE', () => {
    it.each([
      [
        'SELECT * FROM customers WHERE EXISTS (SELECT 1 FROM orders WHERE customer_id = customers.id)',
        'SELECT customers SELECT orders',
      ],
      [
        'SELECT * FROM products WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE product_id = products.id)',
        'SELECT products SELECT order_items',
      ],
      ['SELECT * FROM orders WHERE customer_id NOT IN (SELECT id FROM customers)', 'SELECT orders SELECT customers'],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('OTEL spec examples', () => {
    it.each([
      ['SELECT * FROM wuser_table WHERE username = ?', 'SELECT wuser_table'],
      [
        'INSERT INTO shipping_details (order_id, address) SELECT order_id, address FROM orders WHERE order_id = ?',
        'INSERT shipping_details SELECT orders',
      ],
      ['SELECT * FROM songs, artists WHERE songs.artist_id == artists.id', 'SELECT songs artists'],
      [
        'SELECT order_date FROM (SELECT * FROM orders o JOIN customers c ON o.customer_id = c.customer_id)',
        'SELECT SELECT orders customers',
      ],
      ['SELECT * FROM "song list", \'artists\'', 'SELECT "song list" \'artists\''],
    ])('%j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });
  });

  describe('truncation', () => {
    it('truncates at 255 characters on a word boundary', () => {
      const longTable = 'a'.repeat(300);
      const query = `SELECT * FROM ${longTable}`;
      const result = getSqlQuerySummary(query);

      expect(result.length).toBeLessThanOrEqual(255);
      expect(result).toBe('SELECT');
    });

    it('does not truncate queries within the limit', () => {
      const table = 'a'.repeat(200);
      const query = `SELECT * FROM ${table}`;

      expect(getSqlQuerySummary(query)).toBe(`SELECT ${table}`);
    });
  });
});
