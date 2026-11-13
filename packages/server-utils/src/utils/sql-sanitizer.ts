let integerLiteralRE: RegExp | undefined;
let mssqlIntegerLiteralRE: RegExp | undefined;

/**
 * The lookbehind keeps `$n` and `?n` parameter placeholders out of the match. T-SQL has neither,
 * and `$1000` there is a money literal, so `$` only guards a placeholder outside `mssql`.
 *
 * Lazy init: constructing a lookbehind at module scope evaluates it on import and crashes
 * Safari <16.4 browser bundles that reach this file via the core barrel.
 */
function getIntegerLiteralRE(dialect: SqlDialect): RegExp {
  if (dialect === 'mssql') {
    if (!mssqlIntegerLiteralRE) {
      mssqlIntegerLiteralRE = new RegExp('(?<!\\?)-?\\b\\d+\\b', 'g');
    }
    return mssqlIntegerLiteralRE;
  }
  if (!integerLiteralRE) {
    integerLiteralRE = new RegExp('(?<![$?])-?\\b\\d+\\b', 'g');
  }
  return integerLiteralRE;
}

/**
 * SQL dialect variants that matter for finding the end of a string literal:
 * - `standard` (PostgreSQL, SQLite): `"` quotes identifiers, `''` is the only in-string escape,
 *   and PostgreSQL's `$$…$$` dollar quoting opens a literal.
 * - `mysql`: `"` quotes a string literal unless `ANSI_QUOTES` is set, and `\` escapes the next
 *   character unless `NO_BACKSLASH_ESCAPES` is set. Both default to off, and mysql/mysql2 escape
 *   inlined values with backslashes, so this is the mode their statements arrive in.
 * - `mssql`: `[...]` quotes an identifier, so a `'` inside one is part of the name. `"` quotes
 *   one too, unless the connection sets `QUOTED_IDENTIFIER OFF`, which tedious leaves on.
 * - `clickhouse`: `"` quotes an identifier as in `standard`, but `\` escapes the next character in a
 *   string literal and `#` starts a line comment, as in `mysql`. `$$…$$` heredocs open a literal.
 */
export type SqlDialect = 'standard' | 'mysql' | 'mssql' | 'clickhouse';

/**
 * Maps a driver or `db.system.name` value to the dialect its statements are written in. Callers
 * report different spellings for one engine: knex uses the driver name, Prisma the provider name,
 * and OTel the semantic-convention name. An engine we do not know about is lexed as `standard`.
 */
export function toSqlDialect(system: unknown): SqlDialect {
  if (system === 'mysql' || system === 'mysql2' || system === 'mariadb') {
    return 'mysql';
  }
  if (system === 'mssql' || system === 'sqlserver' || system === 'microsoft.sql_server') {
    return 'mssql';
  }
  if (system === 'clickhouse') {
    return 'clickhouse';
  }
  return 'standard';
}

// Sticky, so the scanner can test one position without slicing the query on every `$`.
const DOLLAR_QUOTE_RE = /\$(?:[A-Za-z_]\w*)?\$/y;
const CLICKHOUSE_DOLLAR_QUOTE_RE = /\$\w*\$/y;
const CLICKHOUSE_NUMBER_RE =
  /-?(?:0x[\dA-F_]+|0b[01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:e[+-]?[\d_]+)?)(?![\w$])/iy;

const CLICKHOUSE_WORD_RE = /[A-Za-z_][\w$]*/y;

// A FORMAT clause follows a complete table name or expression. After one of these tokens `format`
// is a table, column or alias name instead.
const CLICKHOUSE_OPERAND_PREFIXES = new Set([
  'INTO',
  'TABLE',
  'SELECT',
  'DISTINCT',
  'FROM',
  'JOIN',
  'USING',
  'ON',
  'WHERE',
  'PREWHERE',
  'HAVING',
  'BY',
  'AND',
  'OR',
  'NOT',
  'AS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'IN',
  'IS',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  ',',
  '.',
  '=',
  '<',
  '>',
  '!',
  '+',
  '-',
  '/',
  '%',
  '|',
  '&',
]);

interface ClickhouseInsertState {
  /** Whether the statement is an INSERT, decided by its first word. */
  insert?: boolean;
  /** The last token: an upper-cased word, a punctuation character, or `''` for a literal or quoted identifier. */
  previous?: string;
  depth: number;
}

/**
 * Whether `char` starts the inline data of an INSERT. Everything after the top-level FORMAT clause is
 * input data, which cannot be sanitized as SQL. That includes `INSERT ... SELECT`, where the
 * `input()` table function reads that data.
 */
function isClickhouseInsertData(sql: string, start: number, char: string, state: ClickhouseInsertState): boolean {
  if (char === '(') state.depth++;
  if (char === ')') state.depth--;
  if (/\s/.test(char) || (isIdentifierChar(char) && isIdentifierChar(sql[start - 1]))) {
    return false;
  }
  CLICKHOUSE_WORD_RE.lastIndex = start;
  const word = CLICKHOUSE_WORD_RE.exec(sql)?.[0].toUpperCase();
  if (word) {
    state.insert ??= word === 'INSERT';
  }
  if (
    state.insert &&
    state.depth === 0 &&
    word === 'FORMAT' &&
    !CLICKHOUSE_OPERAND_PREFIXES.has(state.previous ?? '')
  ) {
    return true;
  }
  state.previous = word ?? char;
  return false;
}

function matchClickhouseNumber(sql: string, start: number): string | undefined {
  if (isIdentifierChar(sql[start - 1]) || sql[start - 1] === '?') {
    return undefined;
  }
  CLICKHOUSE_NUMBER_RE.lastIndex = start;
  return CLICKHOUSE_NUMBER_RE.exec(sql)?.[0];
}

/**
 * Returns the index just past the run's closing `delimiter`, or -1 if the run never closes. The
 * caller cannot derive that from the index alone: a query ending in `[a]]` consumed a doubled
 * delimiter, not a closing one.
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
  return -1;
}

// An unterminated comment consumes the rest of the query.
function findBlockCommentEnd(sql: string, start: number, nested: boolean): number {
  let depth = 1;
  let i = start + 2;
  while (i < sql.length && depth > 0) {
    if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
    } else if (nested && sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
    } else {
      i++;
    }
  }
  return i;
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
  const isClickhouse = dialect === 'clickhouse';
  const out: string[] = [];
  let i = 0;
  // A literal, number or quoted identifier completes an operand, so it resets `previous`.
  const clickhouseInsert: ClickhouseInsertState = { depth: 0 };

  while (i < sql.length) {
    const char = sql[i]!;
    const next = sql[i + 1];

    if ((char === '-' && next === '-') || ((isMysql || isClickhouse) && char === '#')) {
      const lineEnd = sql.indexOf('\n', i);
      i = lineEnd === -1 ? sql.length : lineEnd;
      continue;
    }

    if (char === '/' && next === '*') {
      i = findBlockCommentEnd(sql, i, isClickhouse);
      continue;
    }

    // In a dollar-quoted body (`$$body$$`, `$tag$body$tag$`) nothing has syntax meaning. Read the
    // previous character from the query, not from `out`, where a dropped comment would leave `$$`
    // looking like part of an identifier. Of the `standard` engines only PostgreSQL has dollar
    // quoting. SQLite `$name` parameters do not match the tag pattern, apart from the rare `$a$b`.
    // ClickHouse heredocs use the same syntax.
    if ((dialect === 'standard' || isClickhouse) && char === '$' && !isIdentifierChar(sql[i - 1])) {
      const tag = matchDollarQuoteTag(sql, i, isClickhouse);
      if (tag) {
        const bodyEnd = sql.indexOf(tag, i + tag.length);
        i = bodyEnd === -1 ? sql.length : bodyEnd + tag.length;
        out.push('?');
        clickhouseInsert.previous = '';
        continue;
      }
    }

    const identifierCloser = getIdentifierCloser(char, dialect);
    if (identifierCloser) {
      const runEnd = findQuotedRunEnd(sql, i, identifierCloser, isClickhouse);
      // A run that never closes is not an identifier, so it collapses instead of being copied out.
      // Copying would carry every literal in the rest of the statement through unlexed.
      out.push(runEnd === -1 ? '?' : sql.slice(i, runEnd));
      i = runEnd === -1 ? sql.length : runEnd;
      clickhouseInsert.previous = '';
      continue;
    }

    if (char === "'" || (char === '"' && isMysql)) {
      // A prefix like `X'1A'`, `B'01'`, `N'…'` or PostgreSQL's `E'a\nb'` is part of the literal, so it has
      // to collapse into the same `?` instead of being left behind as a bare identifier.
      const prefix = char === "'" ? getLiteralPrefix(out, dialect) : undefined;
      if (prefix) {
        out.pop();
      }
      const runEnd = findQuotedRunEnd(sql, i, char, isMysql || isClickhouse || prefix === 'E');
      i = runEnd === -1 ? sql.length : runEnd;
      out.push('?');
      clickhouseInsert.previous = '';
      continue;
    }

    const number = isClickhouse ? matchClickhouseNumber(sql, i) : undefined;
    if (number) {
      out.push('?');
      i += number.length;
      clickhouseInsert.previous = '';
      continue;
    }
    if (isClickhouse && isClickhouseInsertData(sql, i, char, clickhouseInsert)) {
      break;
    }
    out.push(char);
    i++;
  }

  return out.join('');
}

/**
 * Returns the character that closes an identifier opened by `char`, or undefined if `char` opens
 * none. SQL Server brackets close on `]`, and `]]` escapes a `]` inside the name, which is the same
 * doubling rule `findQuotedRunEnd` applies to quotes.
 */
function getIdentifierCloser(char: string, dialect: SqlDialect): string | undefined {
  if (char === '`') {
    return '`';
  }
  if (char === '"' && dialect !== 'mysql') {
    return '"';
  }
  return char === '[' && dialect === 'mssql' ? ']' : undefined;
}

/** Whether `char` can appear inside an identifier. `undefined` (start of query) counts as a break. */
function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[\w$]/.test(char);
}

/** Returns the opening dollar-quote tag at `start` (`$$` or `$tag$`), or undefined if there is none. */
function matchDollarQuoteTag(sql: string, start: number, clickhouse: boolean): string | undefined {
  const pattern = clickhouse ? CLICKHOUSE_DOLLAR_QUOTE_RE : DOLLAR_QUOTE_RE;
  pattern.lastIndex = start;
  return pattern.exec(sql)?.[0];
}

/**
 * Returns the literal-prefix character immediately before a `'`, if there is one: `X`/`B` for
 * hex/binary literals, `N` for a national-character literal (SQL Server, MySQL), or `E` for a
 * PostgreSQL escape string (which honors backslash escapes).
 */
function getLiteralPrefix(out: string[], dialect: SqlDialect): 'X' | 'B' | 'N' | 'E' | undefined {
  const last = out[out.length - 1];
  // A prefix only counts when it stands alone — the `X` in `MAX'...'` belongs to the identifier
  if (last?.length !== 1 || isIdentifierChar(out[out.length - 2]?.slice(-1))) {
    return undefined;
  }

  const prefix = last.toUpperCase();
  if (prefix === 'X' || prefix === 'B' || prefix === 'N') {
    return prefix;
  }
  return prefix === 'E' && dialect === 'standard' ? 'E' : undefined;
}

/**
 * Sanitize SQL query as per the OTEL semantic conventions
 * https://opentelemetry.io/docs/specs/semconv/database/database-spans/#sanitization-of-dbquerytext
 *
 * Parameter placeholders survive: PostgreSQL `$n`, SQLite `?n`, and named forms like `:name` and
 * `@name`. Per the OTEL spec they mark a parameterized query, so only values (strings, numbers,
 * booleans) are sanitized.
 *
 * Pass `dialect` when the statement comes from a driver whose literals are not standard-quoted;
 * see {@link SqlDialect}.
 */
export function sanitizeSqlQuery(sqlQuery: string | undefined, dialect: SqlDialect = 'standard'): string {
  if (!sqlQuery) {
    return 'Unknown SQL Query';
  }

  return (
    // Strip comments and string literals first: everything below is a regex that cannot tell
    // whether it is looking at SQL syntax or at a user-supplied value.
    stripLiteralsAndComments(sqlQuery, dialect)
      .replace(/;\s*$/, '') // Remove trailing semicolons
      .replace(/^[\s;]+/, '') // Remove leading semicolons (T-SQL's `;WITH`)
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
      .replace(getIntegerLiteralRE(dialect), '?') // Integers (NOT parameter placeholders)
      // Collapse IN clauses for cardinality (both ? and $n variants)
      .replace(/\bIN\b\s*\(\s*\?(?:\s*,\s*\?)*\s*\)/gi, 'IN (?)')
      .replace(/\bIN\b\s*\(\s*\$\d+(?:\s*,\s*\$\d+)*\s*\)/gi, 'IN ($?)')
  );
}
