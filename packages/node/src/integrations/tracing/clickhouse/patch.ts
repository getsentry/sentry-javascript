import type { Span, Tracer } from '@opentelemetry/api';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { InstrumentationBase } from '@opentelemetry/instrumentation';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { ClickHouseInstrumentationConfig } from './types';

interface ClickHouseSummary {
  [key: string]: unknown;
  elapsed_ns?: string;
  read_bytes?: string;
  read_rows?: string;
  result_bytes?: string;
  result_rows?: string;
  written_bytes?: string;
  written_rows?: string;
}

export interface ClickHouseModuleExports {
  ClickHouseClient: unknown;
}

export interface PatchClickHouseOptions {
  getConfig: () => ClickHouseInstrumentationConfig;
  isEnabled: () => boolean;
  tracer: Tracer;
  unwrap: InstrumentationBase<ClickHouseInstrumentationConfig>['_unwrap'];
  wrap: InstrumentationBase<ClickHouseInstrumentationConfig>['_wrap'];
}

// ClickHouse-specific semantic attributes
const SEMATTRS_DB_SYSTEM = 'db.system';
const SEMATTRS_DB_OPERATION = 'db.operation';
const SEMATTRS_DB_STATEMENT = 'db.statement';
const SEMATTRS_DB_NAME = 'db.name';
const SEMATTRS_NET_PEER_NAME = 'net.peer.name';
const SEMATTRS_NET_PEER_PORT = 'net.peer.port';

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
function extractOperation(queryText: string): string | undefined {
  const trimmed = queryText.trim();
  const match = /^(?<op>\w+)/u.exec(trimmed);
  return match?.groups?.op?.toUpperCase();
}

/**
 * Sanitizes and truncates query text for safe inclusion in spans.
 */
function sanitizeQueryText(queryText: string, maxLength: number): string {
  if (queryText.length <= maxLength) {
    return queryText;
  }
  return `${queryText.substring(0, maxLength)}...`;
}

/**
 * Extracts ClickHouse summary from response headers.
 */
function extractSummary(headers: Record<string, unknown>): ClickHouseSummary | undefined {
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
function addExecutionStats(span: Span, summary: ClickHouseSummary): void {
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

// Type definitions for ClickHouse client internals
interface ClickHouseClientInstance {
  query: unknown;
  insert: unknown;
  exec: unknown;
  command: unknown;
  connection_params?: {
    url?: string;
  };
  options?: {
    url?: string;
  };
}

interface ClickHouseQueryParams {
  [key: string]: unknown;
  query?: string;
}

interface ClickHouseInsertParams {
  [key: string]: unknown;
  table?: string;
  format?: string;
  columns?: string[] | { except?: string[] };
}

interface ClickHouseResponse {
  [key: string]: unknown;
  response_headers?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

/**
 * Patches the ClickHouse client to add OpenTelemetry instrumentation.
 */
export function patchClickHouseClient(
  moduleExports: ClickHouseModuleExports,
  options: PatchClickHouseOptions,
): ClickHouseModuleExports {
  const { wrap, tracer, getConfig, isEnabled } = options;
  const ClickHouseClient = moduleExports.ClickHouseClient;

    if (!ClickHouseClient || typeof ClickHouseClient !== 'function' || !('prototype' in ClickHouseClient)) {
    return moduleExports;
  }

    const ClickHouseClientCtor = ClickHouseClient as new () => {
      query: unknown;
      insert: unknown;
      exec: unknown;
      command: unknown;
    };
    const prototype = ClickHouseClientCtor.prototype;

  // Helper to patch standard query methods
  const patchGeneric = (methodName: string): void => {
    wrap(
      prototype,
      methodName,
      createPatchHandler(methodName, tracer, getConfig, isEnabled, args => {
        const params = (args[0] || {}) as ClickHouseQueryParams;
        const queryText = params.query || (typeof params === 'string' ? params : '');
        return { queryText };
      }),
    );
  };

  // Helper to patch insert specifically
  const patchInsert = (): void => {
    wrap(
      prototype,
      'insert',
      createPatchHandler('insert', tracer, getConfig, isEnabled, args => {
        const params = (args[0] || {}) as ClickHouseInsertParams;
        const table = params.table as string;
        const format = params.format || 'JSONCompactEachRow';
        let statement = `INSERT INTO ${table}`;

        if (params.columns) {
          if (Array.isArray(params.columns)) {
            statement += ` (${params.columns.join(', ')})`;
          } else if (params.columns.except) {
            statement += ` (* EXCEPT (${params.columns.except.join(', ')}))`;
          }
        }
        statement += ` FORMAT ${format}`;

        return {
          queryText: statement,
          operation: 'INSERT', // Explicitly force INSERT operation
        };
      }),
    );
  };

  patchGeneric('query');
  patchGeneric('exec');
  patchGeneric('command');
  patchInsert();

  return moduleExports;
}

/**
 * A generic patch handler factory that handles the boilerplate
 * of span creation, context wrapping, execution, and error handling.
 */
// patch.ts (Partial update - replace the createPatchHandler function)

function createPatchHandler(
  methodName: string,
  tracer: Tracer,
  getConfig: () => ClickHouseInstrumentationConfig,
  isEnabled: () => boolean,
  attributesExtractor: (args: unknown[]) => { queryText: string; operation?: string },
) {
  return function (original: (...args: unknown[]) => unknown) {
    return function (this: ClickHouseClientInstance, ...args: unknown[]): unknown {
      if (!isEnabled()) {
        return original.apply(this, args);
      }

      const config = getConfig();
      let extraction;
      try {
        extraction = attributesExtractor(args);
      } catch (e) {
        extraction = { queryText: '' };
      }

      const { queryText, operation: explicitOp } = extraction;
      const operation = explicitOp || (queryText ? extractOperation(queryText) : methodName.toUpperCase());
      const spanName = operation ? `${operation} clickhouse` : `${methodName} clickhouse`;

      const span = tracer.startSpan(spanName, {
        kind: SpanKind.CLIENT,
        attributes: {
          [SEMATTRS_DB_SYSTEM]: 'clickhouse',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.query',
          [SEMATTRS_DB_OPERATION]: operation,
        },
      });

      if (config.dbName) {
        span.setAttribute(SEMATTRS_DB_NAME, config.dbName);
      }

      if (config.captureQueryText !== false && queryText) {
        const maxLength = config.maxQueryLength || 1000;
        span.setAttribute(SEMATTRS_DB_STATEMENT, sanitizeQueryText(queryText, maxLength));
      }

      // Connection Attributes Logic:
      // 1. Prefer explicit config
      if (config.peerName) {
        span.setAttribute(SEMATTRS_NET_PEER_NAME, config.peerName);
      }
      if (config.peerPort) {
        span.setAttribute(SEMATTRS_NET_PEER_PORT, config.peerPort);
      }

      // 2. Fallback to auto-discovery if attributes are missing
      if (!config.peerName || !config.peerPort) {
        try {
          const clientConfig = this.connection_params || this.options;
          if (clientConfig?.url) {
            const url = new URL(clientConfig.url);
            if (!config.peerName) {
              span.setAttribute(SEMATTRS_NET_PEER_NAME, url.hostname);
            }
            if (!config.peerPort) {
              // Ensure port is stored as a number
              span.setAttribute(SEMATTRS_NET_PEER_PORT, parseInt(url.port, 10) || 8123);
            }
          }
        } catch {
          // ignore failures in auto-discovery
        }
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        const onSuccess = (response: ClickHouseResponse): ClickHouseResponse => {
          if (config.captureExecutionStats !== false && response) {
            const headers = response.response_headers || response.headers;
            if (headers) {
                const summary = extractSummary(headers);
                if (summary) {
                  addExecutionStats(span, summary);
                }
            }
          }
          if (config.responseHook) {
            config.responseHook(span, response);
          }
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return response;
        };

        const onError = (error: Error): never => {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.end();
          throw error;
        };

        try {
          const result = original.apply(this, args) as unknown;
          if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
            return (result as Promise<ClickHouseResponse>).then(onSuccess, onError);
          }
          return onSuccess(result as ClickHouseResponse);
        } catch (error) {
          onError(error as Error);
        }
      });
    };
  };
}
