import { describe, expect, it } from 'vitest';
import { PostgresJsInstrumentation } from '../../../src/integrations/tracing/postgresjs';

describe('PostgresJs', () => {
  const instrumentation = new PostgresJsInstrumentation({ requireParentSpan: true });

  describe('_reconstructQuery', () => {
    const reconstruct = (strings: string[] | undefined) =>
      (
        instrumentation as unknown as { _reconstructQuery: (s: string[] | undefined) => string | undefined }
      )._reconstructQuery(strings);

    describe('undefined/null/empty input handling', () => {
      it('returns undefined for undefined input', () => {
        expect(reconstruct(undefined)).toBeUndefined();
      });

      it('returns undefined for null input', () => {
        expect(reconstruct(null as unknown as undefined)).toBeUndefined();
      });

      it('returns undefined for empty array', () => {
        expect(reconstruct([])).toBeUndefined();
      });

      it('returns undefined for array with single empty string', () => {
        expect(reconstruct([''])).toBeUndefined();
      });

      it('returns undefined for whitespace-only single element', () => {
        // Whitespace-only strings are truthy, so they should be returned
        expect(reconstruct(['   '])).toBe('   ');
      });
    });

    describe('single-element array (non-parameterized queries)', () => {
      it('returns the string as-is for a single-element array', () => {
        expect(reconstruct(['SELECT * FROM users'])).toBe('SELECT * FROM users');
      });

      it('handles sql.unsafe() style queries', () => {
        expect(reconstruct(['SELECT * FROM users WHERE id = $1'])).toBe('SELECT * FROM users WHERE id = $1');
      });

      it('handles complex single-element queries', () => {
        expect(reconstruct(['INSERT INTO users (email, name) VALUES ($1, $2)'])).toBe(
          'INSERT INTO users (email, name) VALUES ($1, $2)',
        );
      });
    });

    describe('multi-element array (parameterized queries)', () => {
      it('reconstructs query with single parameter', () => {
        // sql`SELECT * FROM users WHERE id = ${123}`
        // strings = ["SELECT * FROM users WHERE id = ", ""]
        expect(reconstruct(['SELECT * FROM users WHERE id = ', ''])).toBe('SELECT * FROM users WHERE id = $1');
      });

      it('reconstructs query with two parameters', () => {
        // sql`SELECT * FROM users WHERE id = ${123} AND name = ${'foo'}`
        // strings = ["SELECT * FROM users WHERE id = ", " AND name = ", ""]
        expect(reconstruct(['SELECT * FROM users WHERE id = ', ' AND name = ', ''])).toBe(
          'SELECT * FROM users WHERE id = $1 AND name = $2',
        );
      });

      it('reconstructs query with three parameters', () => {
        // sql`INSERT INTO users (id, name, email) VALUES (${1}, ${'John'}, ${'john@example.com'})`
        expect(reconstruct(['INSERT INTO users (id, name, email) VALUES (', ', ', ', ', ')'])).toBe(
          'INSERT INTO users (id, name, email) VALUES ($1, $2, $3)',
        );
      });

      it('reconstructs query with parameter at the beginning', () => {
        // sql`${tableName} WHERE id = ${123}`
        // strings = ["", " WHERE id = ", ""]
        expect(reconstruct(['', ' WHERE id = ', ''])).toBe('$1 WHERE id = $2');
      });

      it('reconstructs complex query with multiple parameters', () => {
        // sql`SELECT * FROM ${table} WHERE id = ${id} AND status IN (${s1}, ${s2}) ORDER BY ${col}`
        expect(reconstruct(['SELECT * FROM ', ' WHERE id = ', ' AND status IN (', ', ', ') ORDER BY ', ''])).toBe(
          'SELECT * FROM $1 WHERE id = $2 AND status IN ($3, $4) ORDER BY $5',
        );
      });
    });

    describe('edge cases', () => {
      it('handles whitespace-only strings in array', () => {
        expect(reconstruct(['SELECT * FROM users WHERE id = ', '   ', ''])).toBe(
          'SELECT * FROM users WHERE id = $1   $2',
        );
      });

      it('handles query ending without trailing empty string', () => {
        // Some edge cases might not have trailing empty string
        expect(reconstruct(['SELECT * FROM users WHERE id = ', ' LIMIT 10'])).toBe(
          'SELECT * FROM users WHERE id = $1 LIMIT 10',
        );
      });

      it('handles many parameters (10+)', () => {
        // sql`INSERT INTO t VALUES (${a}, ${b}, ${c}, ${d}, ${e}, ${f}, ${g}, ${h}, ${i}, ${j})`
        // 10 params need 11 string parts: prefix + 9 separators + suffix
        const strings = ['INSERT INTO t VALUES (', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ', ')'];
        expect(reconstruct(strings)).toBe('INSERT INTO t VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)');
      });

      it('handles newlines in template strings', () => {
        // sql`SELECT *\nFROM users\nWHERE id = ${123}`
        expect(reconstruct(['SELECT *\nFROM users\nWHERE id = ', ''])).toBe('SELECT *\nFROM users\nWHERE id = $1');
      });

      it('handles unicode characters', () => {
        expect(reconstruct(['SELECT * FROM users WHERE name = ', ' AND emoji = ', ''])).toBe(
          'SELECT * FROM users WHERE name = $1 AND emoji = $2',
        );
      });

      it('handles quotes in template strings', () => {
        // sql`SELECT * FROM "User" WHERE "email" = ${email}`
        expect(reconstruct(['SELECT * FROM "User" WHERE "email" = ', ''])).toBe(
          'SELECT * FROM "User" WHERE "email" = $1',
        );
      });

      it('handles consecutive parameters', () => {
        // sql`SELECT ${a}${b}${c}`
        expect(reconstruct(['SELECT ', '', '', ''])).toBe('SELECT $1$2$3');
      });

      it('handles parameter only query', () => {
        // sql`${rawSql}` - just a single parameter
        expect(reconstruct(['', ''])).toBe('$1');
      });
    });

    describe('integration with _sanitizeSqlQuery', () => {
      const sanitize = (query: string | undefined) =>
        (instrumentation as unknown as { _sanitizeSqlQuery: (q: string | undefined) => string })._sanitizeSqlQuery(
          query,
        );

      it('reconstructed query gets properly sanitized', () => {
        // Full flow: reconstruct then sanitize
        const strings = ['SELECT * FROM users WHERE id = ', ' AND name = ', ''];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('SELECT * FROM users WHERE id = ? AND name = ?');
      });

      it('handles complex parameterized query end-to-end', () => {
        const strings = ['SELECT * FROM users WHERE id = ', ' AND status IN (', ', ', ', ', ')'];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('SELECT * FROM users WHERE id = ? AND status IN (?)');
      });

      it('handles undefined strings array gracefully in full flow', () => {
        const reconstructed = reconstruct(undefined);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('Unknown SQL Query');
      });

      it('handles INSERT with parameterized values', () => {
        // sql`INSERT INTO users (email, name) VALUES (${email}, ${name})`
        const strings = ['INSERT INTO users (email, name) VALUES (', ', ', ')'];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('INSERT INTO users (email, name) VALUES (?, ?)');
      });

      it('handles UPDATE with parameterized values', () => {
        // sql`UPDATE users SET name = ${name} WHERE id = ${id}`
        const strings = ['UPDATE users SET name = ', ' WHERE id = ', ''];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('UPDATE users SET name = ? WHERE id = ?');
      });

      it('handles DELETE with parameterized values', () => {
        // sql`DELETE FROM users WHERE id = ${id}`
        const strings = ['DELETE FROM users WHERE id = ', ''];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('DELETE FROM users WHERE id = ?');
      });

      it('handles query with newlines that get normalized', () => {
        // sql`SELECT *\n  FROM users\n  WHERE id = ${id}`
        const strings = ['SELECT *\n  FROM users\n  WHERE id = ', ''];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('SELECT * FROM users WHERE id = ?');
      });

      it('handles query with trailing semicolon', () => {
        // sql`SELECT * FROM users WHERE id = ${id};`
        const strings = ['SELECT * FROM users WHERE id = ', ';'];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('SELECT * FROM users WHERE id = ?');
      });

      it('handles real-world postgres.js query pattern', () => {
        // Actual pattern from postgres.js: sql`SELECT * FROM "User" WHERE "email" = ${email} AND "name" = ${name}`
        const strings = ['SELECT * FROM "User" WHERE "email" = ', ' AND "name" = ', ''];
        const reconstructed = reconstruct(strings);
        const sanitized = sanitize(reconstructed);
        expect(sanitized).toBe('SELECT * FROM "User" WHERE "email" = ? AND "name" = ?');
      });
    });
  });

  describe('_sanitizeSqlQuery', () => {
    const sanitize = (query: string | undefined) =>
      (instrumentation as unknown as { _sanitizeSqlQuery: (q: string | undefined) => string })._sanitizeSqlQuery(query);

    describe('basic query passthrough', () => {
      it('returns simple SELECT query unchanged', () => {
        expect(sanitize('SELECT * FROM users')).toBe('SELECT * FROM users');
      });

      it('returns simple INSERT query unchanged', () => {
        expect(sanitize('INSERT INTO users VALUES (a, b)')).toBe('INSERT INTO users VALUES (a, b)');
      });
    });

    describe('comment removal', () => {
      it('removes single-line comments', () => {
        expect(sanitize('SELECT * FROM users -- this is a comment')).toBe('SELECT * FROM users');
      });

      it('removes multi-line comments', () => {
        expect(sanitize('SELECT /* comment */ * FROM users')).toBe('SELECT * FROM users');
      });

      it('removes multi-line comments spanning multiple lines', () => {
        expect(sanitize('SELECT /* this\nis\na\ncomment */ * FROM users')).toBe('SELECT * FROM users');
      });
    });

    describe('whitespace normalization', () => {
      it('collapses multiple spaces to single space', () => {
        expect(sanitize('SELECT   *   FROM   users')).toBe('SELECT * FROM users');
      });

      it('normalizes newlines and tabs', () => {
        expect(sanitize('SELECT *\n\tFROM\n\tusers')).toBe('SELECT * FROM users');
      });

      it('trims leading and trailing whitespace', () => {
        expect(sanitize('  SELECT * FROM users  ')).toBe('SELECT * FROM users');
      });
    });

    describe('trailing semicolon removal', () => {
      it('removes trailing semicolon', () => {
        expect(sanitize('SELECT * FROM users;')).toBe('SELECT * FROM users');
      });

      it('removes trailing semicolon with whitespace', () => {
        expect(sanitize('SELECT * FROM users;   ')).toBe('SELECT * FROM users');
      });
    });

    describe('PostgreSQL placeholder replacement', () => {
      it('replaces $1 with ?', () => {
        expect(sanitize('SELECT * FROM users WHERE id = $1')).toBe('SELECT * FROM users WHERE id = ?');
      });

      it('replaces multiple placeholders', () => {
        expect(sanitize('SELECT * FROM users WHERE id = $1 AND name = $2')).toBe(
          'SELECT * FROM users WHERE id = ? AND name = ?',
        );
      });

      it('replaces higher numbered placeholders', () => {
        expect(sanitize('INSERT INTO t VALUES ($1, $10, $100)')).toBe('INSERT INTO t VALUES (?, ?, ?)');
      });
    });

    describe('standalone number replacement', () => {
      it('replaces standalone numbers', () => {
        expect(sanitize('SELECT * FROM users WHERE id = 123')).toBe('SELECT * FROM users WHERE id = ?');
      });

      it('preserves numbers in identifiers', () => {
        expect(sanitize('SELECT * FROM users2 WHERE col1 = 5')).toBe('SELECT * FROM users2 WHERE col1 = ?');
      });

      it('replaces decimal numbers as separate parts', () => {
        expect(sanitize('SELECT * FROM products WHERE price = 19.99')).toBe('SELECT * FROM products WHERE price = ?.?');
      });

      it('replaces negative numbers preserving the minus sign', () => {
        expect(sanitize('SELECT * FROM accounts WHERE balance = -500')).toBe(
          'SELECT * FROM accounts WHERE balance = -?',
        );
      });
    });

    describe('IN clause collapsing', () => {
      it('collapses IN clause with multiple placeholders', () => {
        expect(sanitize('SELECT * FROM users WHERE id IN ($1, $2, $3)')).toBe('SELECT * FROM users WHERE id IN (?)');
      });

      it('collapses IN clause case-insensitively', () => {
        expect(sanitize('SELECT * FROM users WHERE id in ($1, $2)')).toBe('SELECT * FROM users WHERE id IN (?)');
      });

      it('handles IN clause with varied spacing', () => {
        expect(sanitize('SELECT * FROM users WHERE id IN (  $1 ,  $2  ,  $3  )')).toBe(
          'SELECT * FROM users WHERE id IN (?)',
        );
      });

      it('collapses multiple IN clauses in the same query', () => {
        expect(sanitize('SELECT * FROM users WHERE id IN ($1, $2) AND status IN ($3, $4, $5)')).toBe(
          'SELECT * FROM users WHERE id IN (?) AND status IN (?)',
        );
      });

      it('collapses NOT IN clause', () => {
        expect(sanitize('SELECT * FROM users WHERE id NOT IN ($1, $2, $3)')).toBe(
          'SELECT * FROM users WHERE id NOT IN (?)',
        );
      });
    });

    describe('empty/undefined input handling', () => {
      it('returns Unknown SQL Query for undefined', () => {
        expect(sanitize(undefined)).toBe('Unknown SQL Query');
      });

      it('returns Unknown SQL Query for empty string', () => {
        expect(sanitize('')).toBe('Unknown SQL Query');
      });
    });

    describe('combined transformations', () => {
      it('handles complex query with multiple transformations', () => {
        const input = `
          SELECT * FROM users -- fetch all users
          WHERE id = $1
          AND status IN ($2, $3, $4);
        `;
        expect(sanitize(input)).toBe('SELECT * FROM users WHERE id = ? AND status IN (?)');
      });

      it('handles query with comments, whitespace, and placeholders', () => {
        const input = `
          /* Multi-line
             comment */
          INSERT INTO orders (user_id, amount)
          VALUES ($1, $2);
        `;
        expect(sanitize(input)).toBe('INSERT INTO orders (user_id, amount) VALUES (?, ?)');
      });
    });
  });
});
