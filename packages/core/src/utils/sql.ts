const MAX_SUMMARY_LENGTH = 255;

const TABLE_NAME_CHARS = /[^\s(,;)]+/;
const TABLE_NAME = TABLE_NAME_CHARS.source;

const DDL_RE = new RegExp(
  `^\\s*(?<operation>(?:CREATE|DROP)\\s+(?:TABLE|INDEX)|ALTER\\s+TABLE)(?:\\s+IF\\s+(?:NOT\\s+)?EXISTS)?\\s+(?<table>${TABLE_NAME})`,
  'i',
);

const INSERT_RE = new RegExp(`^\\s*(?<operation>INSERT)\\s+INTO\\s+(?<table>${TABLE_NAME})`, 'i');
const UPDATE_RE = new RegExp(`^\\s*(?<operation>UPDATE)\\s+(?<table>${TABLE_NAME})`, 'i');
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
