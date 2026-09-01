import { describe, expect, it } from 'vitest';
import { getSqlQuerySummary, sanitizeSqlQuery } from '../../../src/utils/sql';

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

    it.each([
      ['INSERT OR REPLACE INTO users (id) VALUES (?)', 'INSERT users'],
      ['INSERT OR IGNORE INTO users (id) VALUES (?)', 'INSERT users'],
      ['INSERT OR ABORT INTO users (id) VALUES (?)', 'INSERT users'],
      ['INSERT OR FAIL INTO users (id) VALUES (?)', 'INSERT users'],
      ['INSERT OR ROLLBACK INTO users (id) VALUES (?)', 'INSERT users'],
      ['insert or replace into orders (id) values (?)', 'insert orders'],
    ])('strips the SQLite conflict clause: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it.each([
      ['REPLACE INTO users (id) VALUES (?)', 'REPLACE users'],
      ['replace into orders (id) values (?)', 'replace orders'],
      ['REPLACE INTO shipping_details SELECT * FROM orders', 'REPLACE shipping_details SELECT orders'],
    ])('handles the REPLACE INTO shorthand: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it('captures INSERT OR REPLACE...SELECT with both targets', () => {
      expect(getSqlQuerySummary('INSERT OR REPLACE INTO shipping_details SELECT * FROM orders')).toBe(
        'INSERT shipping_details SELECT orders',
      );
    });
  });

  describe('UPDATE', () => {
    it.each([
      ['UPDATE users SET name = ? WHERE id = ?', 'UPDATE users'],
      ['update orders SET status = ? WHERE created_at < ?', 'update orders'],
      ['UPDATE OR REPLACE users SET name = ? WHERE id = ?', 'UPDATE users'],
      ['UPDATE OR IGNORE orders SET status = ?', 'UPDATE orders'],
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

  it('returns empty srting for whitespace-only queries', () => {
    expect(getSqlQuerySummary('   ')).toBe('');
  });
});

describe('sanitizeSqlQuery', () => {
  describe('passthrough (no literals)', () => {
    it.each([
      ['SELECT * FROM users', 'SELECT * FROM users'],
      ['INSERT INTO users (a, b) SELECT a, b FROM other', 'INSERT INTO users (a, b) SELECT a, b FROM other'],
      [
        'SELECT col1, col2 FROM table1 JOIN table2 ON table1.id = table2.id',
        'SELECT col1, col2 FROM table1 JOIN table2 ON table1.id = table2.id',
      ],
    ])('passes through %p unchanged', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('comment removal', () => {
    it.each([
      ['SELECT * FROM users -- comment', 'SELECT * FROM users'],
      ['SELECT * -- comment\nFROM users', 'SELECT * FROM users'],
      ['SELECT /* comment */ * FROM users', 'SELECT * FROM users'],
      ['SELECT /* multi\nline */ * FROM users', 'SELECT * FROM users'],
      ['SELECT /* c1 */ * FROM /* c2 */ users -- c3', 'SELECT * FROM users'],
    ])('removes comments: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('whitespace normalization', () => {
    it.each([
      ['SELECT   *   FROM   users', 'SELECT * FROM users'],
      ['SELECT *\n\tFROM\n\tusers', 'SELECT * FROM users'],
      ['  SELECT * FROM users  ', 'SELECT * FROM users'],
      ['  SELECT  \n\t  *  \r\n  FROM  \t\t  users  ', 'SELECT * FROM users'],
    ])('normalizes %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('trailing semicolon removal', () => {
    it.each([
      ['SELECT * FROM users;', 'SELECT * FROM users'],
      ['SELECT * FROM users;   ', 'SELECT * FROM users'],
    ])('removes trailing semicolon: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('$n placeholder preservation (OTEL compliance)', () => {
    it.each([
      ['SELECT * FROM users WHERE id = $1', 'SELECT * FROM users WHERE id = $1'],
      ['SELECT * FROM users WHERE id = $1 AND name = $2', 'SELECT * FROM users WHERE id = $1 AND name = $2'],
      ['INSERT INTO t VALUES ($1, $10, $100)', 'INSERT INTO t VALUES ($1, $10, $100)'],
      ['$1 UNION SELECT * FROM users', '$1 UNION SELECT * FROM users'],
      ['SELECT * FROM users LIMIT $1', 'SELECT * FROM users LIMIT $1'],
      ['SELECT $1$2$3', 'SELECT $1$2$3'],
      ['SELECT generate_series($1, $2)', 'SELECT generate_series($1, $2)'],
    ])('preserves $n: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('string literal sanitization', () => {
    it.each([
      ["SELECT * FROM users WHERE name = 'John'", 'SELECT * FROM users WHERE name = ?'],
      ["SELECT * FROM users WHERE a = 'x' AND b = 'y'", 'SELECT * FROM users WHERE a = ? AND b = ?'],
      ["SELECT * FROM users WHERE name = ''", 'SELECT * FROM users WHERE name = ?'],
      ["SELECT * FROM users WHERE name = 'it''s'", 'SELECT * FROM users WHERE name = ?'],
      ["SELECT * FROM users WHERE data = 'a''b''c'", 'SELECT * FROM users WHERE data = ?'],
      ["SELECT * FROM t WHERE desc = 'Use $1 for param'", 'SELECT * FROM t WHERE desc = ?'],
      ["SELECT * FROM users WHERE name = '日本語'", 'SELECT * FROM users WHERE name = ?'],
    ])('sanitizes string: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('numeric literal sanitization', () => {
    it.each([
      ['SELECT * FROM users WHERE id = 123', 'SELECT * FROM users WHERE id = ?'],
      ['SELECT * FROM users WHERE count = 0', 'SELECT * FROM users WHERE count = ?'],
      ['SELECT * FROM products WHERE price = 19.99', 'SELECT * FROM products WHERE price = ?'],
      ['SELECT * FROM products WHERE discount = .5', 'SELECT * FROM products WHERE discount = ?'],
      ['SELECT * FROM accounts WHERE balance = -500', 'SELECT * FROM accounts WHERE balance = ?'],
      ['SELECT * FROM accounts WHERE rate = -0.05', 'SELECT * FROM accounts WHERE rate = ?'],
      ['SELECT * FROM data WHERE value = 1e10', 'SELECT * FROM data WHERE value = ?'],
      ['SELECT * FROM data WHERE value = 1.5e-3', 'SELECT * FROM data WHERE value = ?'],
      ['SELECT * FROM data WHERE value = 2.5E+10', 'SELECT * FROM data WHERE value = ?'],
      ['SELECT * FROM data WHERE value = -1e10', 'SELECT * FROM data WHERE value = ?'],
      ['SELECT * FROM users LIMIT 10 OFFSET 20', 'SELECT * FROM users LIMIT ? OFFSET ?'],
    ])('sanitizes number: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });

    it('preserves numbers in identifiers', () => {
      expect(sanitizeSqlQuery('SELECT * FROM users2 WHERE col1 = 5')).toBe('SELECT * FROM users2 WHERE col1 = ?');
      expect(sanitizeSqlQuery('SELECT * FROM "table1" WHERE "col2" = 5')).toBe(
        'SELECT * FROM "table1" WHERE "col2" = ?',
      );
    });
  });

  describe('hex and binary literal sanitization', () => {
    it.each([
      ["SELECT * FROM t WHERE data = X'1A2B'", 'SELECT * FROM t WHERE data = ?'],
      ["SELECT * FROM t WHERE data = x'ff'", 'SELECT * FROM t WHERE data = ?'],
      ["SELECT * FROM t WHERE data = X''", 'SELECT * FROM t WHERE data = ?'],
      ['SELECT * FROM t WHERE flags = 0x1A2B', 'SELECT * FROM t WHERE flags = ?'],
      ['SELECT * FROM t WHERE flags = 0XFF', 'SELECT * FROM t WHERE flags = ?'],
      ["SELECT * FROM t WHERE bits = B'1010'", 'SELECT * FROM t WHERE bits = ?'],
      ["SELECT * FROM t WHERE bits = b'1111'", 'SELECT * FROM t WHERE bits = ?'],
      ["SELECT * FROM t WHERE bits = B''", 'SELECT * FROM t WHERE bits = ?'],
    ])('sanitizes hex/binary: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('boolean literal sanitization', () => {
    it.each([
      ['SELECT * FROM users WHERE active = TRUE', 'SELECT * FROM users WHERE active = ?'],
      ['SELECT * FROM users WHERE active = FALSE', 'SELECT * FROM users WHERE active = ?'],
      ['SELECT * FROM users WHERE a = true AND b = false', 'SELECT * FROM users WHERE a = ? AND b = ?'],
      ['SELECT * FROM users WHERE a = True AND b = False', 'SELECT * FROM users WHERE a = ? AND b = ?'],
    ])('sanitizes boolean: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });

    it('does not affect identifiers containing TRUE/FALSE', () => {
      expect(sanitizeSqlQuery('SELECT TRUE_FLAG FROM users WHERE active = TRUE')).toBe(
        'SELECT TRUE_FLAG FROM users WHERE active = ?',
      );
    });
  });

  describe('IN clause collapsing', () => {
    it.each([
      ['SELECT * FROM users WHERE id IN (?, ?, ?)', 'SELECT * FROM users WHERE id IN (?)'],
      ['SELECT * FROM users WHERE id IN ($1, $2, $3)', 'SELECT * FROM users WHERE id IN ($?)'],
      ['SELECT * FROM users WHERE id in ($1, $2)', 'SELECT * FROM users WHERE id IN ($?)'],
      ['SELECT * FROM users WHERE id IN (  $1 ,  $2  ,  $3  )', 'SELECT * FROM users WHERE id IN ($?)'],
      [
        'SELECT * FROM users WHERE id IN ($1, $2) AND status IN ($3, $4)',
        'SELECT * FROM users WHERE id IN ($?) AND status IN ($?)',
      ],
      ['SELECT * FROM users WHERE id NOT IN ($1, $2)', 'SELECT * FROM users WHERE id NOT IN ($?)'],
      ['SELECT * FROM users WHERE id NOT IN (?, ?)', 'SELECT * FROM users WHERE id NOT IN (?)'],
      ['SELECT * FROM users WHERE id IN ($1)', 'SELECT * FROM users WHERE id IN ($?)'],
      ['SELECT * FROM users WHERE id IN (1, 2, 3)', 'SELECT * FROM users WHERE id IN (?)'],
    ])('collapses IN clause: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('mixed scenarios (params + literals)', () => {
    it.each([
      ["SELECT * FROM users WHERE id = $1 AND status = 'active'", 'SELECT * FROM users WHERE id = $1 AND status = ?'],
      ['SELECT * FROM users WHERE id = $1 AND limit = 100', 'SELECT * FROM users WHERE id = $1 AND limit = ?'],
      [
        "SELECT * FROM t WHERE a = $1 AND b = 'foo' AND c = 123 AND d = TRUE AND e IN ($2, $3)",
        'SELECT * FROM t WHERE a = $1 AND b = ? AND c = ? AND d = ? AND e IN ($?)',
      ],
    ])('handles mixed: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('PostgreSQL-specific syntax', () => {
    it.each([
      ['SELECT $1::integer', 'SELECT $1::integer'],
      ['SELECT $1::text', 'SELECT $1::text'],
      ['SELECT * FROM t WHERE tags = ARRAY[1, 2, 3]', 'SELECT * FROM t WHERE tags = ARRAY[?, ?, ?]'],
      ['SELECT * FROM t WHERE tags = ARRAY[$1, $2]', 'SELECT * FROM t WHERE tags = ARRAY[$1, $2]'],
      ["SELECT data->'key' FROM t WHERE id = $1", 'SELECT data->? FROM t WHERE id = $1'],
      ["SELECT data->>'key' FROM t WHERE id = $1", 'SELECT data->>? FROM t WHERE id = $1'],
      ["SELECT * FROM t WHERE data @> '{}'", 'SELECT * FROM t WHERE data @> ?'],
      [
        "SELECT * FROM t WHERE created_at > NOW() - INTERVAL '7 days'",
        'SELECT * FROM t WHERE created_at > NOW() - INTERVAL ?',
      ],
      ['CREATE TABLE t (created_at TIMESTAMP(3))', 'CREATE TABLE t (created_at TIMESTAMP(?))'],
      ['CREATE TABLE t (price NUMERIC(10, 2))', 'CREATE TABLE t (price NUMERIC(?, ?))'],
    ])('handles PostgreSQL syntax: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('empty/undefined input', () => {
    it.each([
      [undefined, 'Unknown SQL Query'],
      ['', 'Unknown SQL Query'],
      ['   ', ''],
      ['   \n\t   ', ''],
    ])('handles empty input %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('complex real-world queries', () => {
    it('handles query with comments, whitespace, and IN clause', () => {
      const input = `
        SELECT * FROM users -- fetch all users
        WHERE id = $1
        AND status IN ($2, $3, $4);
      `;
      expect(sanitizeSqlQuery(input)).toBe('SELECT * FROM users WHERE id = $1 AND status IN ($?)');
    });

    it('handles Prisma-style query', () => {
      const input = `
        SELECT "User"."id", "User"."email", "User"."name"
        FROM "User"
        WHERE "User"."email" = $1
        AND "User"."deleted_at" IS NULL
        LIMIT $2;
      `;
      expect(sanitizeSqlQuery(input)).toBe(
        'SELECT "User"."id", "User"."email", "User"."name" FROM "User" WHERE "User"."email" = $1 AND "User"."deleted_at" IS NULL LIMIT $2',
      );
    });

    it('handles CREATE TABLE with various types', () => {
      const input = `
        CREATE TABLE "User" (
          "id" SERIAL NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "email" TEXT NOT NULL,
          "balance" NUMERIC(10, 2) DEFAULT 0.00,
          CONSTRAINT "User_pkey" PRIMARY KEY ("id")
        );
      `;
      expect(sanitizeSqlQuery(input)).toBe(
        'CREATE TABLE "User" ( "id" SERIAL NOT NULL, "createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP, "email" TEXT NOT NULL, "balance" NUMERIC(?, ?) DEFAULT ?, CONSTRAINT "User_pkey" PRIMARY KEY ("id") )',
      );
    });

    it('handles INSERT/UPDATE with mixed literals and params', () => {
      expect(sanitizeSqlQuery("INSERT INTO users (name, age, active) VALUES ('John', 30, TRUE)")).toBe(
        'INSERT INTO users (name, age, active) VALUES (?, ?, ?)',
      );
      expect(sanitizeSqlQuery("UPDATE users SET name = $1, updated_at = '2024-01-01' WHERE id = 123")).toBe(
        'UPDATE users SET name = $1, updated_at = ? WHERE id = ?',
      );
    });
  });

  describe('edge cases', () => {
    it.each([
      ['SELECT * FROM "my-table" WHERE "my-column" = $1', 'SELECT * FROM "my-table" WHERE "my-column" = $1'],
      ['SELECT * FROM t WHERE big_id = 99999999999999999999', 'SELECT * FROM t WHERE big_id = ?'],
      ['SELECT * FROM t WHERE val > -5', 'SELECT * FROM t WHERE val > ?'],
      ['SELECT * FROM t WHERE id IN (1, -2, 3)', 'SELECT * FROM t WHERE id IN (?)'],
      ['SELECT 1+2*3', 'SELECT ?+?*?'],
      ["SELECT * FROM users WHERE name LIKE '%john%'", 'SELECT * FROM users WHERE name LIKE ?'],
      ['SELECT * FROM t WHERE age BETWEEN 18 AND 65', 'SELECT * FROM t WHERE age BETWEEN ? AND ?'],
      ['SELECT * FROM t WHERE age BETWEEN $1 AND $2', 'SELECT * FROM t WHERE age BETWEEN $1 AND $2'],
      [
        "SELECT CASE WHEN status = 'active' THEN 1 ELSE 0 END FROM users",
        'SELECT CASE WHEN status = ? THEN ? ELSE ? END FROM users',
      ],
      [
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE amount > 100)',
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE amount > ?)',
      ],
      [
        "WITH cte AS (SELECT * FROM users WHERE status = 'active') SELECT * FROM cte WHERE id = $1",
        'WITH cte AS (SELECT * FROM users WHERE status = ?) SELECT * FROM cte WHERE id = $1',
      ],
      [
        'SELECT COUNT(*), SUM(amount), AVG(price) FROM orders WHERE status = $1',
        'SELECT COUNT(*), SUM(amount), AVG(price) FROM orders WHERE status = $1',
      ],
      [
        'SELECT status, COUNT(*) FROM orders GROUP BY status HAVING COUNT(*) > 10',
        'SELECT status, COUNT(*) FROM orders GROUP BY status HAVING COUNT(*) > ?',
      ],
      [
        'SELECT ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) FROM orders',
        'SELECT ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) FROM orders',
      ],
    ])('handles edge case: %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });
  });

  describe('regression tests', () => {
    it('does not replace $n with ? (OTEL compliance)', () => {
      const result = sanitizeSqlQuery('SELECT * FROM users WHERE id = $1');
      expect(result).not.toContain('?');
      expect(result).toBe('SELECT * FROM users WHERE id = $1');
    });

    it('does not split decimal numbers into ?.?', () => {
      const result = sanitizeSqlQuery('SELECT * FROM t WHERE price = 19.99');
      expect(result).not.toBe('SELECT * FROM t WHERE price = ?.?');
      expect(result).toBe('SELECT * FROM t WHERE price = ?');
    });

    it('does not leave minus sign when sanitizing negative numbers', () => {
      const result = sanitizeSqlQuery('SELECT * FROM t WHERE val = -500');
      expect(result).not.toBe('SELECT * FROM t WHERE val = -?');
      expect(result).toBe('SELECT * FROM t WHERE val = ?');
    });

    it('handles exact queries from integration tests', () => {
      expect(
        sanitizeSqlQuery(
          'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
        ),
      ).toBe(
        'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
      );
      expect(sanitizeSqlQuery('SELECT * from generate_series(1,1000) as x')).toBe(
        'SELECT * from generate_series(?,?) as x',
      );
    });

    it('does not let comment syntax inside a literal cut the literal short', () => {
      expect(sanitizeSqlQuery("SELECT * FROM t WHERE a = 'from secret--x'")).toBe('SELECT * FROM t WHERE a = ?');
      expect(sanitizeSqlQuery("SELECT * FROM t WHERE a = 'from secret/*x*/'")).toBe('SELECT * FROM t WHERE a = ?');
    });

    it('honors backslash escapes in PostgreSQL escape strings', () => {
      expect(sanitizeSqlQuery(String.raw`SELECT * FROM t WHERE a = E'it\'s from secret' AND b = 1`)).toBe(
        'SELECT * FROM t WHERE a = ? AND b = ?',
      );
    });
  });

  describe("dialect: 'mysql'", () => {
    it.each([
      // MySQL reads `"..."` as a string literal, not as an identifier, unless ANSI_QUOTES is set
      ['SELECT * FROM users WHERE name = "John"', 'SELECT * FROM users WHERE name = ?'],
      ['SELECT * FROM users WHERE a = "x" AND b = \'y\'', 'SELECT * FROM users WHERE a = ? AND b = ?'],
      ['SELECT * FROM `users` WHERE `name` = "John"', 'SELECT * FROM `users` WHERE `name` = ?'],
      ['SELECT * FROM t WHERE a = "x" # trailing comment', 'SELECT * FROM t WHERE a = ?'],
      // backslash escapes — the shape mysql/mysql2 emit when they inline a value
      [String.raw`SELECT * FROM users WHERE name = 'O\'Brien'`, 'SELECT * FROM users WHERE name = ?'],
      [String.raw`SELECT * FROM users WHERE bio = 'a \"quote\" here'`, 'SELECT * FROM users WHERE bio = ?'],
      [String.raw`SELECT * FROM t WHERE a = 'x\\' AND b = 'y'`, 'SELECT * FROM t WHERE a = ? AND b = ?'],
    ])('sanitizes %p', (input, expected) => {
      expect(sanitizeSqlQuery(input, 'mysql')).toBe(expected);
    });

    it('keeps a quote inside a backticked identifier from opening a literal', () => {
      expect(sanitizeSqlQuery("SELECT `it's` FROM t WHERE a = 'x'", 'mysql')).toBe("SELECT `it's` FROM t WHERE a = ?");
    });
  });

  describe('regression: values must not survive as summary targets', () => {
    // A literal that survives sanitization and happens to contain `from`/`join`/`select` is read
    // as a table name by getSqlQuerySummary, which puts it in `db.query.summary` and — with span
    // streaming — in the span name.
    it.each([
      ['SELECT * FROM users WHERE name = "from bob@secret.com"', 'bob@secret.com'],
      ['SELECT * FROM users WHERE bio = "i come from Berlin and join clubs"', 'Berlin'],
      ['INSERT INTO t (c) VALUES ("select from s3cret-token")', 's3cret-token'],
      [String.raw`SELECT * FROM users WHERE name = 'O\'Brien from ACME'`, 'ACME'],
      [String.raw`UPDATE t SET a = 'x\'y from Z' WHERE id = 5`, 'from Z'],
    ])('strips the value out of %p', (input, value) => {
      const sanitized = sanitizeSqlQuery(input, 'mysql');
      expect(sanitized).not.toContain(value);
      expect(getSqlQuerySummary(sanitized)).not.toContain(value);
    });
  });
});
