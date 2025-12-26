import type { Span } from '@opentelemetry/api';

export interface ClickHouseSummary {
  [key: string]: unknown;
  elapsed_ns?: string;
  read_bytes?: string;
  read_rows?: string;
  result_bytes?: string;
  result_rows?: string;
  written_bytes?: string;
  written_rows?: string;
}

// ClickHouse execution statistics attributes
const SEMATTRS_CLICKHOUSE_READ_ROWS = 'clickhouse.read_rows';
const SEMATTRS_CLICKHOUSE_READ_BYTES = 'clickhouse.read_bytes';
const SEMATTRS_CLICKHOUSE_WRITTEN_ROWS = 'clickhouse.written_rows';
const SEMATTRS_CLICKHOUSE_WRITTEN_BYTES = 'clickhouse.written_bytes';
const SEMATTRS_CLICKHOUSE_RESULT_ROWS = 'clickhouse.result_rows';
const SEMATTRS_CLICKHOUSE_RESULT_BYTES = 'clickhouse.result_bytes';
const SEMATTRS_CLICKHOUSE_ELAPSED_NS = 'clickhouse.elapsed_ns';

/**
 * Extracts the SQL operation (SELECT, INSERT, etc.) from query text.
 */
export function extractOperation(queryText: string): string | undefined {
  const trimmed = queryText.trim();
  const match = /^(?<op>\w+)/u.exec(trimmed);
  return match?.groups?.op?.toUpperCase();
}

/**
 * Sanitizes and truncates query text for safe inclusion in spans.
 */
export function sanitizeQueryText(queryText: string, maxLength: number): string {
  if (queryText.length <= maxLength) {
    return queryText;
  }
  return `${queryText.substring(0, maxLength)}...`;
}

/**
 * Extracts ClickHouse summary from response headers.
 */
export function extractSummary(headers: Record<string, unknown>): ClickHouseSummary | undefined {
  if (!headers) {
    return undefined;
  }

  const summary = headers['x-clickhouse-summary'] as string | undefined;
  if (summary && typeof summary === 'string') {
    try {
      return JSON.parse(summary);
    } catch {
      return undefined;
    }
  }

  if ('read_rows' in headers || 'result_rows' in headers || 'elapsed_ns' in headers) {
    return headers;
  }

  return undefined;
}

/**
 * Adds ClickHouse execution statistics to span attributes.
 */
export function addExecutionStats(span: Span, summary: ClickHouseSummary): void {
  if (!summary) {
    return;
  }

  try {
    if (summary.read_rows !== undefined) {
      const readRows = parseInt(summary.read_rows, 10);
      if (!isNaN(readRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_READ_ROWS, readRows);
      }
    }
    if (summary.read_bytes !== undefined) {
      const readBytes = parseInt(summary.read_bytes, 10);
      if (!isNaN(readBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_READ_BYTES, readBytes);
      }
    }
    if (summary.written_rows !== undefined) {
      const writtenRows = parseInt(summary.written_rows, 10);
      if (!isNaN(writtenRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_WRITTEN_ROWS, writtenRows);
      }
    }
    if (summary.written_bytes !== undefined) {
      const writtenBytes = parseInt(summary.written_bytes, 10);
      if (!isNaN(writtenBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_WRITTEN_BYTES, writtenBytes);
      }
    }
    if (summary.result_rows !== undefined) {
      const resultRows = parseInt(summary.result_rows, 10);
      if (!isNaN(resultRows)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_RESULT_ROWS, resultRows);
      }
    }
    if (summary.result_bytes !== undefined) {
      const resultBytes = parseInt(summary.result_bytes, 10);
      if (!isNaN(resultBytes)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_RESULT_BYTES, resultBytes);
      }
    }
    if (summary.elapsed_ns !== undefined) {
      const elapsedNs = parseInt(summary.elapsed_ns, 10);
      if (!isNaN(elapsedNs)) {
        span.setAttribute(SEMATTRS_CLICKHOUSE_ELAPSED_NS, elapsedNs);
      }
    }
  } catch {
    // Silently ignore errors in stats extraction
  }
}
