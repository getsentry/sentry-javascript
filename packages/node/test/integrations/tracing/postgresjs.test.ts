import { describe, expect, it } from 'vitest';
import { PostgresJsInstrumentation } from '../../../src/integrations/tracing/postgresjs';

describe('PostgresJs', () => {
  describe('_sanitizeSqlQuery', () => {
    const instrumentation = new PostgresJsInstrumentation({ requireParentSpan: true });
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
