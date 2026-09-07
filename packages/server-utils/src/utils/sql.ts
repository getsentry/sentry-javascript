const MAX_SUMMARY_LENGTH = 255;

const TABLE_NAME_CHARS = /[^\s(,;)]+/;
const TABLE_NAME = TABLE_NAME_CHARS.source;

const DDL_RE = new RegExp(
  `^\\s*(?<operation>(?:CREATE|DROP)\\s+(?:TABLE|INDEX)|ALTER\\s+TABLE)(?:\\s+IF\\s+(?:NOT\\s+)?EXISTS)?\\s+(?<table>${TABLE_NAME})`,
  'i',
);

// SQLite upserts insert an optional conflict clause between operation and INTO
// (`INSERT OR REPLACE INTO`, https://sqlite.org/lang_insert.html), with `REPLACE INTO` as the
// standalone shorthand. The clause is filler like INTO — stripping it keeps upserts on the same
// low-cardinality summary as plain inserts.
const INSERT_RE = new RegExp(
  `^\\s*(?<operation>INSERT|REPLACE)(?:\\s+OR\\s+(?:ROLLBACK|ABORT|FAIL|IGNORE|REPLACE))?\\s+INTO\\s+(?<table>${TABLE_NAME})`,
  'i',
);
const UPDATE_RE = new RegExp(
  `^\\s*(?<operation>UPDATE)(?:\\s+OR\\s+(?:ROLLBACK|ABORT|FAIL|IGNORE|REPLACE))?\\s+(?<table>${TABLE_NAME})`,
  'i',
);
const DELETE_RE = new RegExp(`^\\s*(?<operation>DELETE)\\s+FROM\\s+(?<table>${TABLE_NAME})`, 'i');

const SELECT_RE = /^\s*\(?\s*(?<operation>SELECT)\b/i;

const PRAGMA_RE = /^\s*(?<operation>PRAGMA)\s+(?<command>\S+)/i;

const TOKEN_RE = /\b(?:FROM|JOIN)\s+|\(\s*(SELECT)\b|\b(?:UNION|INTERSECT|EXCEPT|MINUS)\s+(?:ALL\s+)?(SELECT)\b/gi;
const QUOTED_OR_PLAIN_TABLE_RE = /^(?:"[^"]*"|'[^']*'|[^\s(,;)]+)/;
const COMMA_TABLE_RE = /^\s*,\s*((?:"[^"]*"|'[^']*'|[^\s(,;)]+))/;
const SUBQUERY_SELECT_RE = /^\(\s*(SELECT)\b/i;

/**
 * Derives a low-cardinality summary from a SQL query for use as `db.query.summary`.
 *
 * Conforms to the OTEL semantic convention for generating query summaries:
 * - Preserves original case of operations and identifiers (no normalization)
 * - Uses format: `{operation} {target1} {target2} ...`
 * - Strips filler words (INTO, FROM) from the operation
 * - Captures multiple table targets (JOINs)
 * - Handles INSERT...SELECT with both targets
 * - Truncates to 255 characters without splitting mid-value
 *
 * @see https://opentelemetry.io/docs/specs/semconv/database/database-spans/#generating-a-summary-of-the-query
 */
export function getSqlQuerySummary(query: string | undefined): string | undefined {
  if (!query) {
    return undefined;
  }

  const pragmaMatch = PRAGMA_RE.exec(query);
  if (pragmaMatch?.groups?.['operation'] && pragmaMatch.groups['command']) {
    const operation = pragmaMatch.groups['operation'];
    const command = pragmaMatch.groups['command'];
    const parenIdx = command.indexOf('(');
    return truncate(`${operation} ${parenIdx >= 0 ? command.substring(0, parenIdx) : command}`);
  }

  const ddlMatch = DDL_RE.exec(query);
  if (ddlMatch?.groups?.['operation'] && ddlMatch.groups['table']) {
    return truncate(`${ddlMatch.groups['operation']} ${ddlMatch.groups['table']}`);
  }

  const insertMatch = INSERT_RE.exec(query);
  if (insertMatch?.groups?.['operation'] && insertMatch.groups['table']) {
    const parts = [insertMatch.groups['operation'], insertMatch.groups['table']];
    const rest = query.slice(insertMatch[0].length);
    const subSelect = /\b(SELECT)\b/i.exec(rest);
    if (subSelect?.[1]) {
      parts.push(subSelect[1]);
      const selectTables = extractTableNames(rest.slice(subSelect.index));
      parts.push(...selectTables);
    }
    return truncate(parts.join(' '));
  }

  const updateMatch = UPDATE_RE.exec(query);
  if (updateMatch?.groups?.['operation'] && updateMatch.groups['table']) {
    return truncate(`${updateMatch.groups['operation']} ${updateMatch.groups['table']}`);
  }

  const deleteMatch = DELETE_RE.exec(query);
  if (deleteMatch?.groups?.['operation'] && deleteMatch.groups['table']) {
    return truncate(`${deleteMatch.groups['operation']} ${deleteMatch.groups['table']}`);
  }

  const selectMatch = SELECT_RE.exec(query);
  if (selectMatch?.groups?.['operation']) {
    const tables = extractTableNames(query.slice(selectMatch[0].length));
    if (tables.length > 0) {
      return truncate(`${selectMatch.groups['operation']} ${tables.join(' ')}`);
    }
    return selectMatch.groups['operation'];
  }

  return truncate(query.trim().split(/\s+/)[0] ?? query);
}

function extractTableNames(sql: string): string[] {
  const tables: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(sql)) !== null) {
    if (match[1] || match[2]) {
      tables.push((match[1] || match[2])!);
      continue;
    }

    const rest = sql.slice(match.index + match[0].length);

    const subqueryMatch = SUBQUERY_SELECT_RE.exec(rest);
    if (subqueryMatch?.[1]) {
      tables.push(subqueryMatch[1]);
      TOKEN_RE.lastIndex = match.index + match[0].length + subqueryMatch[0].length;
      continue;
    }

    const tableMatch = QUOTED_OR_PLAIN_TABLE_RE.exec(rest);
    if (!tableMatch) continue;
    tables.push(tableMatch[0]);

    let afterTable = rest.slice(tableMatch[0].length);
    let commaMatch: RegExpExecArray | null;
    while ((commaMatch = COMMA_TABLE_RE.exec(afterTable)) !== null) {
      if (!commaMatch[1]) break;
      tables.push(commaMatch[1]);
      afterTable = afterTable.slice(commaMatch[0].length);
    }
  }

  return tables;
}

function truncate(summary: string): string {
  if (summary.length <= MAX_SUMMARY_LENGTH) {
    return summary;
  }
  const truncated = summary.substring(0, MAX_SUMMARY_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
}

let integerLiteralRE: RegExp | undefined;

/**
 * SQL dialect variants that matter for finding the end of a string literal:
 * - `standard` (PostgreSQL, SQLite): `"` quotes identifiers and `''` is the only in-string escape.
 * - `mysql`: `"` quotes a string literal unless `ANSI_QUOTES` is set, and `\` escapes the next
 *   character unless `NO_BACKSLASH_ESCAPES` is set. Both default to off, and mysql/mysql2 escape
 *   inlined values with backslashes, so this is the mode their statements arrive in.
 */
export type SqlDialect = 'standard' | 'mysql';

/**
 * Returns the index just past the run's closing `delimiter`, or the end of the query if the run is
 * never closed — an unterminated literal must swallow the remainder rather than let it through.
 *
 * A doubled delimiter (`''`) escapes itself in every dialect; backslash escapes are dialect- and
 * context-dependent, so the caller decides.
 */
function findQuotedRunEnd(sql: string, start: number, delimiter: string, backslashEscapes: boolean): number {
  for (let i = start + 1; i < sql.length; i++) {
    const char = sql[i];
    if (backslashEscapes && char === '\\') {
      i++;
    } else if (char === delimiter) {
      if (sql[i + 1] !== delimiter) {
        return i + 1;
      }
      i++;
    }
  }
  return sql.length;
}

/**
 * Replaces every string literal with `?` and drops every comment, in one pass.
 *
 * Doing this by scanning rather than by regex is what keeps quote state and comment state from
 * being decided independently: a regex for `'...'` cannot see that the quote it stopped at was
 * backslash-escaped, and a regex for `--...` cannot see that the `--` sits inside a literal. Both
 * mistakes end with user data surviving into `db.query.text` and `db.query.summary`.
 *
 * Quoted identifiers are preserved — they are the table and column names the query summary is
 * built from.
 */
function stripLiteralsAndComments(sql: string, dialect: SqlDialect): string {
  const isMysql = dialect === 'mysql';
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const char = sql[i]!;
    const next = sql[i + 1];

    if ((char === '-' && next === '-') || (isMysql && char === '#')) {
      const lineEnd = sql.indexOf('\n', i);
      i = lineEnd === -1 ? sql.length : lineEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = sql.indexOf('*/', i + 2);
      i = commentEnd === -1 ? sql.length : commentEnd + 2;
      continue;
    }

    // Quoted identifiers: backticks in MySQL, double quotes everywhere else
    if (char === '`' || (char === '"' && !isMysql)) {
      const runEnd = findQuotedRunEnd(sql, i, char, false);
      out += sql.slice(i, runEnd);
      i = runEnd;
      continue;
    }

    if (char === "'" || (char === '"' && isMysql)) {
      // A prefix like `X'1A'`, `B'01'` or PostgreSQL's `E'a\nb'` is part of the literal, so it has
      // to collapse into the same `?` instead of being left behind as a bare identifier.
      const prefix = char === "'" ? getLiteralPrefix(out, isMysql) : undefined;
      out = prefix ? out.slice(0, -1) : out;
      i = findQuotedRunEnd(sql, i, char, isMysql || prefix === 'E');
      out += '?';
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

/**
 * Returns the literal-prefix character immediately before a `'`, if there is one: `X`/`B` for
 * hex/binary literals, or `E` for a PostgreSQL escape string (which honors backslash escapes).
 */
function getLiteralPrefix(out: string, isMysql: boolean): 'X' | 'B' | 'E' | undefined {
  // A prefix only counts when it stands alone — the `X` in `MAX'...'` belongs to the identifier
  if (/[\w$]/.test(out.slice(-2, -1))) {
    return undefined;
  }

  const prefix = out.slice(-1).toUpperCase();
  if (prefix === 'X' || prefix === 'B') {
    return prefix;
  }
  return prefix === 'E' && !isMysql ? 'E' : undefined;
}

/**
 * Sanitize SQL query as per the OTEL semantic conventions
 * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
 *
 * PostgreSQL $n placeholders are preserved per OTEL spec - they're parameterized queries,
 * not sensitive literals. Only actual values (strings, numbers, booleans) are sanitized.
 *
 * Pass `dialect` when the statement comes from a driver whose literals are not standard-quoted;
 * see {@link SqlDialect}.
 */
export function sanitizeSqlQuery(sqlQuery: string | undefined, dialect: SqlDialect = 'standard'): string {
  if (!sqlQuery) {
    return 'Unknown SQL Query';
  }

  // Lazy init: constructing this at module scope would evaluate the lookbehind
  // on import and crash Safari <16.4 browser bundles that reach this file via
  // the core barrel. Building it on first call keeps the cost off the import path.
  if (!integerLiteralRE) {
    integerLiteralRE = new RegExp('(?<!\\$)-?\\b\\d+\\b', 'g');
  }

  return (
    // Strip comments and string literals first: everything below is a regex that cannot tell
    // whether it is looking at SQL syntax or at a user-supplied value.
    stripLiteralsAndComments(sqlQuery, dialect)
      .replace(/;\s*$/, '') // Remove trailing semicolons
      // Collapse whitespace to a single space (after removing comments)
      .replace(/\s+/g, ' ')
      .trim() // Remove extra spaces and trim
      // Sanitize hex numbers
      .replace(/\b0x[0-9A-Fa-f]+/gi, '?')
      // Sanitize boolean literals
      .replace(/\b(?:TRUE|FALSE)\b/gi, '?')
      // Sanitize numeric literals (preserve $n placeholders via negative lookbehind)
      .replace(/-?\b\d+\.?\d*[eE][+-]?\d+\b/g, '?') // Scientific notation
      .replace(/-?\b\d+\.\d+\b/g, '?') // Decimals
      .replace(/-?\.\d+\b/g, '?') // Decimals starting with dot
      .replace(integerLiteralRE, '?') // Integers (NOT $n placeholders)
      // Collapse IN clauses for cardinality (both ? and $n variants)
      .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')
      .replace(/\bIN\b\s*\(\s*\$\d+(?:\s*,\s*\$\d+)*\s*\)/gi, 'IN ($?)')
  );
}
