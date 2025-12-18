import { describe, expect, it } from 'vitest';
import { PostgresJsInstrumentation } from '../../../src/integrations/tracing/postgresjs';

describe('PostgresJs', () => {
  const instrumentation = new PostgresJsInstrumentation({ requireParentSpan: true });

  describe('_reconstructQuery', () => {
    const reconstruct = (strings: string[] | undefined) =>
      (
        instrumentation as unknown as { _reconstructQuery: (s: string[] | undefined) => string | undefined }
      )._reconstructQuery(strings);

    describe('empty input handling', () => {
      it.each([
        [undefined, undefined],
        [null as unknown as undefined, undefined],
        [[], undefined],
        [[''], undefined],
      ])('returns undefined for %p', (input, expected) => {
        expect(reconstruct(input)).toBe(expected);
      });

      it('returns whitespace-only string as-is', () => {
        expect(reconstruct(['   '])).toBe('   ');
      });
    });

    describe('single-element array (non-parameterized)', () => {
      it.each([
        ['SELECT * FROM users', 'SELECT * FROM users'],
        ['SELECT * FROM users WHERE id = $1', 'SELECT * FROM users WHERE id = $1'],
        ['INSERT INTO users (email, name) VALUES ($1, $2)', 'INSERT INTO users (email, name) VALUES ($1, $2)'],
      ])('returns %p as-is', (input, expected) => {
        expect(reconstruct([input])).toBe(expected);
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
        expect(reconstruct(input)).toBe(expected);
      });
    });

    describe('edge cases', () => {
      it('handles 10+ parameters', () => {
        const strings = ['INSERT INTO t VALUES (', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ')'];
        expect(reconstruct(strings)).toBe('INSERT INTO t VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)');
      });

      it.each([
        [['SELECT * FROM users WHERE id = ', '   ', ''], 'SELECT * FROM users WHERE id = $1   $2'],
        [['SELECT * FROM users WHERE id = ', ' LIMIT 10'], 'SELECT * FROM users WHERE id = $1 LIMIT 10'],
        [['SELECT *\nFROM users\nWHERE id = ', ''], 'SELECT *\nFROM users\nWHERE id = $1'],
        [['SELECT * FROM "User" WHERE "email" = ', ''], 'SELECT * FROM "User" WHERE "email" = $1'],
        [['SELECT ', '', '', ''], 'SELECT $1$2$3'],
        [['', ''], '$1'],
      ])('handles edge case %p', (input, expected) => {
        expect(reconstruct(input)).toBe(expected);
      });
    });

    describe('integration with _sanitizeSqlQuery', () => {
      const sanitize = (query: string | undefined) =>
        (instrumentation as unknown as { _sanitizeSqlQuery: (q: string | undefined) => string })._sanitizeSqlQuery(
          query,
        );

      it('preserves $n placeholders per OTEL spec', () => {
        const strings = ['SELECT * FROM users WHERE id = ', ' AND name = ', ''];
        expect(sanitize(reconstruct(strings))).toBe('SELECT * FROM users WHERE id = $1 AND name = $2');
      });

      it('collapses IN clause with $n to IN ($?)', () => {
        const strings = ['SELECT * FROM users WHERE id = ', ' AND status IN (', ', ', ', ', ')'];
        expect(sanitize(reconstruct(strings))).toBe('SELECT * FROM users WHERE id = $1 AND status IN ($?)');
      });

      it('returns Unknown SQL Query for undefined input', () => {
        expect(sanitize(reconstruct(undefined))).toBe('Unknown SQL Query');
      });

      it('normalizes whitespace and removes trailing semicolon', () => {
        const strings = ['SELECT *\n  FROM users\n  WHERE id = ', ';'];
        expect(sanitize(reconstruct(strings))).toBe('SELECT * FROM users WHERE id = $1');
      });
    });
  });

  describe('_sanitizeSqlQuery', () => {
    const sanitize = (query: string | undefined) =>
      (instrumentation as unknown as { _sanitizeSqlQuery: (q: string | undefined) => string })._sanitizeSqlQuery(query);

    describe('passthrough (no literals)', () => {
      it.each([
        ['SELECT * FROM users', 'SELECT * FROM users'],
        ['INSERT INTO users (a, b) SELECT a, b FROM other', 'INSERT INTO users (a, b) SELECT a, b FROM other'],
        [
          'SELECT col1, col2 FROM table1 JOIN table2 ON table1.id = table2.id',
          'SELECT col1, col2 FROM table1 JOIN table2 ON table1.id = table2.id',
        ],
      ])('passes through %p unchanged', (input, expected) => {
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('whitespace normalization', () => {
      it.each([
        ['SELECT   *   FROM   users', 'SELECT * FROM users'],
        ['SELECT *\n\tFROM\n\tusers', 'SELECT * FROM users'],
        ['  SELECT * FROM users  ', 'SELECT * FROM users'],
        ['  SELECT  \n\t  *  \r\n  FROM  \t\t  users  ', 'SELECT * FROM users'],
      ])('normalizes %p', (input, expected) => {
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('trailing semicolon removal', () => {
      it.each([
        ['SELECT * FROM users;', 'SELECT * FROM users'],
        ['SELECT * FROM users;   ', 'SELECT * FROM users'],
      ])('removes trailing semicolon: %p', (input, expected) => {
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
      });

      it('preserves numbers in identifiers', () => {
        expect(sanitize('SELECT * FROM users2 WHERE col1 = 5')).toBe('SELECT * FROM users2 WHERE col1 = ?');
        expect(sanitize('SELECT * FROM "table1" WHERE "col2" = 5')).toBe('SELECT * FROM "table1" WHERE "col2" = ?');
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
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('boolean literal sanitization', () => {
      it.each([
        ['SELECT * FROM users WHERE active = TRUE', 'SELECT * FROM users WHERE active = ?'],
        ['SELECT * FROM users WHERE active = FALSE', 'SELECT * FROM users WHERE active = ?'],
        ['SELECT * FROM users WHERE a = true AND b = false', 'SELECT * FROM users WHERE a = ? AND b = ?'],
        ['SELECT * FROM users WHERE a = True AND b = False', 'SELECT * FROM users WHERE a = ? AND b = ?'],
      ])('sanitizes boolean: %p', (input, expected) => {
        expect(sanitize(input)).toBe(expected);
      });

      it('does not affect identifiers containing TRUE/FALSE', () => {
        expect(sanitize('SELECT TRUE_FLAG FROM users WHERE active = TRUE')).toBe(
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
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
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
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('empty/undefined input', () => {
      it.each([
        [undefined, 'Unknown SQL Query'],
        ['', 'Unknown SQL Query'],
        ['   ', ''],
        ['   \n\t   ', ''],
      ])('handles empty input %p', (input, expected) => {
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('complex real-world queries', () => {
      it('handles query with comments, whitespace, and IN clause', () => {
        const input = `
          SELECT * FROM users -- fetch all users
          WHERE id = $1
          AND status IN ($2, $3, $4);
        `;
        expect(sanitize(input)).toBe('SELECT * FROM users WHERE id = $1 AND status IN ($?)');
      });

      it('handles Prisma-style query', () => {
        const input = `
          SELECT "User"."id", "User"."email", "User"."name"
          FROM "User"
          WHERE "User"."email" = $1
          AND "User"."deleted_at" IS NULL
          LIMIT $2;
        `;
        expect(sanitize(input)).toBe(
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
        expect(sanitize(input)).toBe(
          'CREATE TABLE "User" ( "id" SERIAL NOT NULL, "createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP, "email" TEXT NOT NULL, "balance" NUMERIC(?, ?) DEFAULT ?, CONSTRAINT "User_pkey" PRIMARY KEY ("id") )',
        );
      });

      it('handles INSERT/UPDATE with mixed literals and params', () => {
        expect(sanitize("INSERT INTO users (name, age, active) VALUES ('John', 30, TRUE)")).toBe(
          'INSERT INTO users (name, age, active) VALUES (?, ?, ?)',
        );
        expect(sanitize("UPDATE users SET name = $1, updated_at = '2024-01-01' WHERE id = 123")).toBe(
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
        expect(sanitize(input)).toBe(expected);
      });
    });

    describe('regression tests', () => {
      it('does not replace $n with ? (OTEL compliance)', () => {
        const result = sanitize('SELECT * FROM users WHERE id = $1');
        expect(result).not.toContain('?');
        expect(result).toBe('SELECT * FROM users WHERE id = $1');
      });

      it('does not split decimal numbers into ?.?', () => {
        const result = sanitize('SELECT * FROM t WHERE price = 19.99');
        expect(result).not.toBe('SELECT * FROM t WHERE price = ?.?');
        expect(result).toBe('SELECT * FROM t WHERE price = ?');
      });

      it('does not leave minus sign when sanitizing negative numbers', () => {
        const result = sanitize('SELECT * FROM t WHERE val = -500');
        expect(result).not.toBe('SELECT * FROM t WHERE val = -?');
        expect(result).toBe('SELECT * FROM t WHERE val = ?');
      });

      it('handles exact queries from integration tests', () => {
        expect(
          sanitize(
            'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
          ),
        ).toBe(
          'CREATE TABLE "User" ("id" SERIAL NOT NULL,"createdAt" TIMESTAMP(?) NOT NULL DEFAULT CURRENT_TIMESTAMP,"email" TEXT NOT NULL,"name" TEXT,CONSTRAINT "User_pkey" PRIMARY KEY ("id"))',
        );
        expect(sanitize('SELECT * from generate_series(1,1000) as x')).toBe('SELECT * from generate_series(?,?) as x');
      });
    });
  });
});
