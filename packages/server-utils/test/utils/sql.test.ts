import { describe, expect, it } from 'vitest';
import { getSqlQuerySummary, sanitizeSqlQuery, sanitizeSqlQueryWithSummary, toSqlDialect } from '../../src/utils/sql';

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

  describe('quoted and schema-qualified table names', () => {
    it.each([
      ['SELECT * FROM "public"."User"', 'SELECT "public"."User"'],
      ['DELETE FROM "public"."User"', 'DELETE "public"."User"'],
      ['INSERT INTO "public"."User" (name) VALUES (?)', 'INSERT "public"."User"'],
      ['UPDATE "public"."User" SET name = ?', 'UPDATE "public"."User"'],
      ['CREATE TABLE "public"."User" (id INTEGER)', 'CREATE TABLE "public"."User"'],
      ['SELECT * FROM public.User', 'SELECT public.User'],
      ['SELECT * FROM `mydb`.`users`', 'SELECT `mydb`.`users`'],
      ['SELECT * FROM "catalog"."public"."User"', 'SELECT "catalog"."public"."User"'],
      ['SELECT * FROM "public".User', 'SELECT "public".User'],
      ['SELECT * FROM public."User"', 'SELECT public."User"'],
    ])('keeps the whole qualified name: %j => %j', (input, expected) => {
      expect(getSqlQuerySummary(input)).toBe(expected);
    });

    it('keeps schema-qualified JOIN targets distinguishable', () => {
      expect(getSqlQuerySummary('SELECT * FROM "public"."A" JOIN "public"."B" ON "A".id = "B"."a_id"')).toBe(
        'SELECT "public"."A" "public"."B"',
      );
    });

    it.each([
      ['SELECT * FROM "my table"', 'SELECT "my table"'],
      ['INSERT INTO "my table" (id) VALUES (?)', 'INSERT "my table"'],
      ['UPDATE "my table" SET id = ?', 'UPDATE "my table"'],
      ['DELETE FROM "my table"', 'DELETE "my table"'],
      ['CREATE TABLE "my table" (id INTEGER)', 'CREATE TABLE "my table"'],
      ['SELECT * FROM "my schema"."my table"', 'SELECT "my schema"."my table"'],
    ])('does not split identifiers containing spaces: %j => %j', (input, expected) => {
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

  describe("dialect: 'standard'", () => {
    it.each([
      // `"..."` quotes an identifier, so it survives as a summary target
      ['SELECT * FROM "User" WHERE "email" = \'jane@example.com\'', 'SELECT * FROM "User" WHERE "email" = ?'],
      ['SELECT "col""umn" FROM t WHERE a = 1', 'SELECT "col""umn" FROM t WHERE a = ?'],
      // PostgreSQL reads `#` as a bitwise operator, not a comment
      ['SELECT * FROM t WHERE a # 1 = 2', 'SELECT * FROM t WHERE a # ? = ?'],
      // `\` is an ordinary character, so the literal ends at the next quote
      [String.raw`SELECT * FROM t WHERE path = 'C:\' AND b = 2`, 'SELECT * FROM t WHERE path = ? AND b = ?'],
      // dollar-quoted strings (PostgreSQL), tagged and untagged
      ["SELECT * FROM t WHERE a = $$O'Brien$$", 'SELECT * FROM t WHERE a = ?'],
      ['SELECT * FROM t WHERE a = $tag$secret$tag$ AND b = $1', 'SELECT * FROM t WHERE a = ? AND b = $1'],
      ['SELECT $$a$$, $$b$$ FROM t', 'SELECT ?, ? FROM t'],
      // a `$` inside an identifier does not open a dollar quote, even when a dropped comment is
      // what separates the two
      ['SELECT a$$b FROM t WHERE c = 1', 'SELECT a$$b FROM t WHERE c = ?'],
      ['SELECT a /* c */ $$secret$$ FROM t', 'SELECT a ? FROM t'],
      ['SELECT a/* c */$$secret$$ FROM t', 'SELECT a? FROM t'],
      // `$name` is a SQLite parameter placeholder, not a dollar quote
      ['INSERT INTO t (a, b) VALUES ($name, $email)', 'INSERT INTO t (a, b) VALUES ($name, $email)'],
      // national-character literals collapse with their prefix: `N'...'` in SQL Server (which
      // requires the uppercase N) and in MySQL (which takes either case)
      ["SELECT * FROM t WHERE name = N'Jane'", 'SELECT * FROM t WHERE name = ?'],
      ["SELECT * FROM t WHERE name = n'Jane'", 'SELECT * FROM t WHERE name = ?'],
      // ... unless the `N` belongs to the identifier before it. `MIN'x'` parses in no dialect. It
      // guards against a name ending in N eating the quote after it.
      ["SELECT MIN'x' FROM t", 'SELECT MIN? FROM t'],
    ])('sanitizes %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
      expect(sanitizeSqlQuery(input, 'standard')).toBe(expected);
    });

    // Known limit: SQLite reads `"..."` as a string when the name matches no column
    // (`SQLITE_DQS`), and only the schema tells that apart from an identifier. Drivers that bind
    // their values never emit this shape.
    it('leaves a SQLite double-quoted string in place', () => {
      expect(sanitizeSqlQuery('SELECT * FROM t WHERE a = "jane@example.com"')).toBe(
        'SELECT * FROM t WHERE a = "jane@example.com"',
      );
    });
  });

  describe('dialect divergence', () => {
    it.each([
      // [input, standard, mysql]
      ['SELECT * FROM t WHERE name = "Jane"', 'SELECT * FROM t WHERE name = "Jane"', 'SELECT * FROM t WHERE name = ?'],
      ['SELECT * FROM t WHERE a = 1 # 2', 'SELECT * FROM t WHERE a = ? # ?', 'SELECT * FROM t WHERE a = ?'],
      [
        String.raw`SELECT * FROM t WHERE a = 'x\' AND b = 'Jane'`,
        'SELECT * FROM t WHERE a = ? AND b = ?',
        // MySQL reads `\'` as an escaped quote, so the literal runs to the quote before `Jane` and
        // swallows the statement text. The server lexes it the same way, which leaves `Jane` a bare
        // token here, not the value it looks like.
        'SELECT * FROM t WHERE a = ?Jane?',
      ],
      // MySQL has no dollar quoting and allows `$` in identifiers, so it leaves `$...$` alone
      ['SELECT $col$x FROM t WHERE a = 1', 'SELECT ?', 'SELECT $col$x FROM t WHERE a = ?'],
      ['SELECT `a` FROM t WHERE b = 1', 'SELECT `a` FROM t WHERE b = ?', 'SELECT `a` FROM t WHERE b = ?'],
    ])('%p sanitizes to %p (standard) and %p (mysql)', (input, standard, mysql) => {
      expect(sanitizeSqlQuery(input, 'standard')).toBe(standard);
      expect(sanitizeSqlQuery(input, 'mysql')).toBe(mysql);
    });
  });

  describe("dialect: 'mssql'", () => {
    it.each([
      // `[...]` quotes an identifier, so a `'` inside one belongs to the name
      ["SELECT * FROM [dbo].[user's] WHERE email = 'jane@example.com'", "SELECT * FROM [dbo].[user's] WHERE email = ?"],
      // `]]` escapes a `]` inside the name
      ['SELECT [a]]b] FROM [t] WHERE c = 1', 'SELECT [a]]b] FROM [t] WHERE c = ?'],
      ['SELECT * FROM [dbo].[Customer Orders] WHERE id = @P1', 'SELECT * FROM [dbo].[Customer Orders] WHERE id = @P1'],
      ["INSERT INTO [dbo].[users] ([name]) VALUES (N'Jane')", 'INSERT INTO [dbo].[users] ([name]) VALUES (?)'],
      // T-SQL has no `E'...'` escape strings, so the `E` stays an identifier
      ["SELECT * FROM t WHERE a = E'x'", 'SELECT * FROM t WHERE a = E?'],
      // ... and no dollar quoting, where `$` is an ordinary identifier character
      ['SELECT * FROM t WHERE a = $$x$$', 'SELECT * FROM t WHERE a = $$x$$'],
      // `$n` is a money literal here, not the placeholder it is in PostgreSQL
      ['SELECT * FROM t WHERE price = $1000', 'SELECT * FROM t WHERE price = $?'],
      ['SELECT * FROM t WHERE price = $10.50', 'SELECT * FROM t WHERE price = $?'],
    ])('sanitizes %p', (input, expected) => {
      expect(sanitizeSqlQuery(input, 'mssql')).toBe(expected);
    });
  });

  describe('unterminated literals swallow the rest of the statement', () => {
    it.each([
      ["SELECT * FROM t WHERE a = 'jane@example.com AND b = 2", 'standard' as const],
      ["SELECT * FROM t WHERE a = N'jane@example.com AND b = 2", 'standard' as const],
      ['SELECT * FROM t WHERE a = $$jane@example.com AND b = 2', 'standard' as const],
      ['SELECT * FROM t WHERE a = "jane@example.com AND b = 2', 'mysql' as const],
      ["SELECT * FROM t WHERE a = 'jane@example.com AND b = 2", 'mysql' as const],
    ])('drops the unterminated value in %p (%s)', (input, dialect) => {
      expect(sanitizeSqlQuery(input, dialect)).toBe('SELECT * FROM t WHERE a = ?');
    });

    // An unterminated identifier quote is the same hazard: the rest of the statement is not a
    // name, so copying it through would carry the literals in it out unlexed.
    it.each([
      ["SELECT * FROM [users WHERE email = 'jane@example.com'", 'mssql' as const],
      ["SELECT * FROM \"users WHERE email = 'jane@example.com'", 'standard' as const],
      ["SELECT * FROM `users WHERE email = 'jane@example.com'", 'mysql' as const],
    ])('drops the unterminated identifier in %p (%s)', (input, dialect) => {
      expect(sanitizeSqlQuery(input, dialect)).toBe('SELECT * FROM ?');
    });

    // The run ends on a doubled closer, which escapes the character rather than closing the name
    it.each([
      ["SELECT * FROM [t WHERE email = 'jane@example.com' AND x = [a]]", 'mssql' as const],
      ['SELECT * FROM "t WHERE email = \'jane@example.com\' AND x = a""', 'standard' as const],
      ["SELECT * FROM `t WHERE email = 'jane@example.com' AND x = a``", 'mysql' as const],
    ])('drops an identifier left open by an escaped closer in %p (%s)', (input, dialect) => {
      expect(sanitizeSqlQuery(input, dialect)).toBe('SELECT * FROM ?');
    });
  });

  describe('representative statements per driver', () => {
    it.each([
      // pg / postgres-js: parameterized text passes through unchanged
      [
        'SELECT "User"."id" FROM "public"."User" WHERE "User"."email" = $1 AND "User"."age" > $2 LIMIT $3',
        'SELECT "User"."id" FROM "public"."User" WHERE "User"."email" = $1 AND "User"."age" > $2 LIMIT $3',
      ],
      // pg: values inlined by the caller instead of bound
      [
        "SELECT * FROM users WHERE email = 'jane@example.com' AND created_at > '2024-01-01' ORDER BY id DESC LIMIT 10",
        'SELECT * FROM users WHERE email = ? AND created_at > ? ORDER BY id DESC LIMIT ?',
      ],
      [
        "UPDATE accounts SET balance = balance - 42.50, note = 'rent for jane' WHERE owner_email = 'jane@example.com'",
        'UPDATE accounts SET balance = balance - ?, note = ? WHERE owner_email = ?',
      ],
      [
        "DELETE FROM sessions WHERE token = 'sk_live_abc123' OR expires_at < NOW() - INTERVAL '7 days'",
        'DELETE FROM sessions WHERE token = ? OR expires_at < NOW() - INTERVAL ?',
      ],
    ])('sanitizes PostgreSQL statement %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });

    it.each([
      // mysql/mysql2 escape inlined values with backslashes and quote identifiers with backticks
      [
        "SELECT * FROM `users` WHERE `email` = 'o\\'brien@example.com' AND `active` = 1",
        'SELECT * FROM `users` WHERE `email` = ? AND `active` = ?',
      ],
      [
        "INSERT INTO `users` (`name`, `bio`) VALUES ('Jane', 'says \\\"hi\\\" a lot')",
        'INSERT INTO `users` (`name`, `bio`) VALUES (?, ?)',
      ],
      [
        'SELECT * FROM `users` WHERE `id` = ? AND `status` = ?',
        'SELECT * FROM `users` WHERE `id` = ? AND `status` = ?',
      ],
      [
        'UPDATE `orders` SET `note` = "customer said: don\'t ship" WHERE `id` = 7',
        'UPDATE `orders` SET `note` = ? WHERE `id` = ?',
      ],
    ])('sanitizes MySQL statement %p', (input, expected) => {
      expect(sanitizeSqlQuery(input, 'mysql')).toBe(expected);
    });

    it.each([
      // SQLite (D1, Nitro/Nuxt): `?`, `?n` and named placeholders survive, inlined values do not
      [
        "INSERT INTO users (name, email) VALUES ('Jane', 'jane@example.com')",
        'INSERT INTO users (name, email) VALUES (?, ?)',
      ],
      [
        'INSERT OR REPLACE INTO users (id, email) VALUES (?1, ?2)',
        'INSERT OR REPLACE INTO users (id, email) VALUES (?1, ?2)',
      ],
      [
        'SELECT * FROM users WHERE email = :email AND age > @minAge',
        'SELECT * FROM users WHERE email = :email AND age > @minAge',
      ],
      ['PRAGMA table_info(users)', 'PRAGMA table_info(users)'],
    ])('sanitizes SQLite statement %p', (input, expected) => {
      expect(sanitizeSqlQuery(input)).toBe(expected);
    });

    it.each([
      // tedious (SQL Server): `@P1` placeholders survive, `N'...'` literals do not
      [
        'SELECT [id], [email] FROM [dbo].[users] WHERE [email] = @P1 AND [age] > @P2',
        'SELECT [id], [email] FROM [dbo].[users] WHERE [email] = @P1 AND [age] > @P2',
      ],
      ["SELECT TOP 10 * FROM users WHERE email = N'jane@example.com'", 'SELECT TOP ? * FROM users WHERE email = ?'],
      [
        "INSERT INTO users (name, email) VALUES (N'Jane', N'jane@example.com')",
        'INSERT INTO users (name, email) VALUES (?, ?)',
      ],
    ])('sanitizes SQL Server statement %p', (input, expected) => {
      expect(sanitizeSqlQuery(input, 'mssql')).toBe(expected);
    });
  });

  describe('regression: values must not survive as summary targets', () => {
    // A literal that survives sanitization and happens to contain `from`/`join`/`select` is read
    // as a table name by getSqlQuerySummary, which puts it in `db.query.summary` and — with span
    // streaming — in the span name.
    it.each([
      ['mysql' as const, 'SELECT * FROM users WHERE name = "from bob@secret.com"', 'bob@secret.com'],
      ['mysql' as const, 'SELECT * FROM users WHERE bio = "i come from Berlin and join clubs"', 'Berlin'],
      ['mysql' as const, 'INSERT INTO t (c) VALUES ("select from s3cret-token")', 's3cret-token'],
      ['mysql' as const, String.raw`SELECT * FROM users WHERE name = 'O\'Brien from ACME'`, 'ACME'],
      ['mysql' as const, String.raw`UPDATE t SET a = 'x\'y from Z' WHERE id = 5`, 'from Z'],
      ['standard' as const, "SELECT * FROM users WHERE name = 'from bob@secret.com'", 'bob@secret.com'],
      ['standard' as const, 'SELECT * FROM users WHERE bio = $$i come from Berlin and join clubs$$', 'Berlin'],
      ['standard' as const, 'INSERT INTO t (c) VALUES ($tag$select from s3cret-token$tag$)', 's3cret-token'],
      ['standard' as const, "SELECT * FROM users WHERE name = N'from ACME'", 'ACME'],
      ['standard' as const, String.raw`UPDATE t SET a = E'x\'y from Z' WHERE id = 5`, 'from Z'],
      ['mssql' as const, "SELECT * FROM [dbo].[users] WHERE note = 'from bob@secret.com'", 'bob@secret.com'],
    ])('strips the value out of %s statement %p', (dialect, input, value) => {
      const sanitized = sanitizeSqlQuery(input, dialect);
      expect(sanitized).not.toContain(value);
      expect(getSqlQuerySummary(sanitized)).not.toContain(value);
    });
  });
});

describe('sanitizeSqlQueryWithSummary', () => {
  it('returns the sanitized statement and its summary', () => {
    expect(sanitizeSqlQueryWithSummary("SELECT * FROM users WHERE email = 'jane@example.com'")).toEqual({
      queryText: 'SELECT * FROM users WHERE email = ?',
      querySummary: 'SELECT users',
    });
  });

  it('passes the dialect through to the sanitizer', () => {
    expect(sanitizeSqlQueryWithSummary('SELECT * FROM users WHERE email = "jane@example.com"', 'mysql')).toEqual({
      queryText: 'SELECT * FROM users WHERE email = ?',
      querySummary: 'SELECT users',
    });
  });

  it('returns undefined for both when there is no statement', () => {
    expect(sanitizeSqlQueryWithSummary(undefined)).toEqual({ queryText: undefined, querySummary: undefined });
    expect(sanitizeSqlQueryWithSummary('')).toEqual({ queryText: undefined, querySummary: undefined });
  });
});

describe('toSqlDialect', () => {
  it.each([
    ['mysql', 'mysql'],
    ['mysql2', 'mysql'],
    ['mariadb', 'mysql'],
    ['mssql', 'mssql'],
    ['sqlserver', 'mssql'],
    ['microsoft.sql_server', 'mssql'],
  ])('maps %j to %j', (system, expected) => {
    expect(toSqlDialect(system)).toBe(expected);
  });

  it.each(['postgresql', 'sqlite', 'oracle', '', undefined])('falls back to standard for %j', system => {
    expect(toSqlDialect(system)).toBe('standard');
  });
});

describe('sanitizeSqlQueryWithSummary', () => {
  it('returns the sanitized statement and its summary', () => {
    expect(sanitizeSqlQueryWithSummary("SELECT * FROM users WHERE email = 'jane@example.com'")).toEqual({
      queryText: 'SELECT * FROM users WHERE email = ?',
      querySummary: 'SELECT users',
    });
  });

  it.each([
    ['mysql' as const, 'SELECT * FROM users WHERE email = "jane@example.com"'],
    ['standard' as const, "SELECT * FROM users WHERE email = 'jane@example.com'"],
    ['standard' as const, 'SELECT * FROM users WHERE email = $$jane@example.com$$'],
    ['standard' as const, "SELECT * FROM users WHERE email = N'jane@example.com'"],
  ])('passes the %s dialect through to the sanitizer: %p', (dialect, input) => {
    expect(sanitizeSqlQueryWithSummary(input, dialect)).toEqual({
      queryText: 'SELECT * FROM users WHERE email = ?',
      querySummary: 'SELECT users',
    });
  });

  it('passes the mssql dialect through, so a quote inside a bracketed name stays part of the name', () => {
    expect(sanitizeSqlQueryWithSummary("SELECT * FROM [users] WHERE [email] = 'jane@example.com'", 'mssql')).toEqual({
      queryText: 'SELECT * FROM [users] WHERE [email] = ?',
      querySummary: 'SELECT [users]',
    });
  });

  it('derives the summary from the sanitized statement, not the raw one', () => {
    expect(sanitizeSqlQueryWithSummary("SELECT * FROM users WHERE bio = 'from secret_table'")).toEqual({
      queryText: 'SELECT * FROM users WHERE bio = ?',
      querySummary: 'SELECT users',
    });
  });

  it('returns undefined for both when there is no statement', () => {
    expect(sanitizeSqlQueryWithSummary(undefined)).toEqual({ queryText: undefined, querySummary: undefined });
    expect(sanitizeSqlQueryWithSummary('')).toEqual({ queryText: undefined, querySummary: undefined });
  });
});
