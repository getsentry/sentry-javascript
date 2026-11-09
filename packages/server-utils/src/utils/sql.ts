import {
  DB_NAMESPACE,
  DB_OPERATION_NAME,
  DB_QUERY_SUMMARY,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
} from '@sentry/conventions/attributes';
import type { SpanAttributes } from '@sentry/core';
import { getClient, hasSpanStreamingEnabled } from '@sentry/core';
import type { SqlDialect } from './sql-sanitizer';
import { sanitizeSqlQuery } from './sql-sanitizer';

export { sanitizeSqlQuery, toSqlDialect } from './sql-sanitizer';
export type { SqlDialect } from './sql-sanitizer';

const MAX_SUMMARY_LENGTH = 255;

// A single identifier: quoted (`"..."`, `'...'`, or MySQL backticks) or bare. The quoted forms have
// to be matched as a unit, otherwise an identifier containing a space or a dot is cut in half.
const IDENTIFIER = '(?:"[^"]*"|\'[^\']*\'|`[^`]*`|[^\\s(,;).\'"`]+)';

// A table reference can be schema-qualified (`"public"."User"`, `db.schema.table`), with each part
// quoted independently. The whole qualified name is the summary target, since the schema is what
// distinguishes two same-named tables.
const TABLE_NAME = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;

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

const SELECT_RE = /^\s*(?:\(\s*)?(?<operation>SELECT)\b/i;

const PRAGMA_RE = /^\s*(?<operation>PRAGMA)\s+(?<command>\S+)/i;

const TOKEN_RE = /\b(?:FROM|JOIN)\s+|\(\s*(SELECT)\b|\b(?:UNION|INTERSECT|EXCEPT|MINUS)\s+(?:ALL\s+)?(SELECT)\b/gi;
const TABLE_REF_RE = new RegExp(`^${TABLE_NAME}`);
const COMMA_TABLE_RE = new RegExp(`^\\s*,\\s*(${TABLE_NAME})`);
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

const LEADING_KEYWORD_RE = /^\s*(?:\(\s*)*([A-Za-z]+)\b/;
const CTE_MAIN_STATEMENT_RE = /\(|\)|\b(SELECT|INSERT|UPDATE|DELETE|MERGE|VALUES|TABLE)\b/gi;

/**
 * Derives `db.operation.name` from a SQL query: the first operation keyword, in its original case.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/db/#db-operation-name
 */
export function getSqlOperationName(query: string | undefined): string | undefined {
  const match = query ? LEADING_KEYWORD_RE.exec(query) : null;
  const keyword = match?.[1];
  if (!query || !match || !keyword) {
    return undefined;
  }
  // Scanned from after `WITH`, so parentheses wrapping the whole query don't shift the depth.
  return keyword.toUpperCase() === 'WITH' ? getCteMainOperationName(query.slice(match[0].length)) : keyword;
}

/**
 * The operation of a `WITH` query is its main statement: the first operation keyword outside the
 * CTE bodies, which are all parenthesized. Counting parentheses is safe on a sanitized query, which
 * has no literals or comments left.
 */
function getCteMainOperationName(query: string): string | undefined {
  let depth = 0;
  for (const match of query.matchAll(CTE_MAIN_STATEMENT_RE)) {
    if (match[0] === '(') {
      depth++;
    } else if (match[0] === ')') {
      depth--;
    } else if (depth === 0) {
      return match[1];
    }
  }
  return undefined;
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

    const tableMatch = TABLE_REF_RE.exec(rest);
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

export interface SqlQueryAttributes {
  [DB_QUERY_TEXT]: string | undefined;
  [DB_QUERY_SUMMARY]: string | undefined;
  [DB_OPERATION_NAME]: string | undefined;
}

/**
 * Sanitizes a collected SQL statement into the query attributes the SQL integrations attach to
 * their spans: `db.query.text`, `db.query.summary` and `db.operation.name`. All are `undefined`
 * when there is no statement, so an empty query omits the attributes instead of reporting the
 * sanitizer's fallback text.
 */
export function getSqlQueryAttributes(sqlQuery: string | undefined, dialect?: SqlDialect): SqlQueryAttributes {
  const queryText = (sqlQuery && sanitizeSqlQuery(sqlQuery, dialect)) || undefined;
  return {
    [DB_QUERY_TEXT]: queryText,
    [DB_QUERY_SUMMARY]: getSqlQuerySummary(queryText),
    [DB_OPERATION_NAME]: getSqlOperationName(queryText),
  };
}

/**
 * Names a SQL span with a low-cardinality name: `db.query.summary`, falling back to `db.namespace`
 * and then `db.system.name`. `fallback` is the integration's name for a span with none of those.
 *
 * New SQL integrations should name their spans with this regardless of span streaming.
 */
export function getLowCardinalitySqlSpanName(attributes: SpanAttributes, fallback: string): string {
  return toSpanName(attributes[DB_QUERY_SUMMARY] || attributes[DB_NAMESPACE] || attributes[DB_SYSTEM_NAME], fallback);
}

/**
 * Names a SQL span from its attributes. Streamed span names have to be low cardinality (see
 * {@link getLowCardinalitySqlSpanName}); otherwise the sanitized `db.query.text` is used, which
 * existing integrations keep for spans that aren't streamed.
 */
export function getSqlSpanName(attributes: SpanAttributes, fallback: string): string {
  const client = getClient();
  if (client && hasSpanStreamingEnabled(client)) {
    return getLowCardinalitySqlSpanName(attributes, fallback);
  }
  return toSpanName(attributes[DB_QUERY_TEXT], fallback);
}

function toSpanName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}
