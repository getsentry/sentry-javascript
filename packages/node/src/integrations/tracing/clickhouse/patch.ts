import type { Tracer } from '@opentelemetry/api';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import type { InstrumentationBase } from '@opentelemetry/instrumentation';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP } from '@sentry/core';
import type { ClickHouseInstrumentationConfig } from './types';
import { addExecutionStats, extractOperation, extractSummary, sanitizeQueryText } from './utils';

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

// Type definitions for ClickHouse client internals
interface ClickHouseClientInstance {
  query: unknown;
  insert: unknown;
  exec: unknown;
  command: unknown;
  connection_params?: { url?: string };
  options?: { url?: string };
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

  const patchInsert = (): void => {
    wrap(
      prototype,
      'insert',
      createPatchHandler('insert', tracer, getConfig, isEnabled, args => {
        const params = (args[0] || {}) as ClickHouseInsertParams;
        const table = params.table || '<unknown>';
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
        return { queryText: statement, operation: 'INSERT' };
      }),
    );
  };

  patchGeneric('query');
  patchGeneric('exec');
  patchGeneric('command');
  patchInsert();

  return moduleExports;
}

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
      } catch {
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
      if (config.peerName) {
        span.setAttribute(SEMATTRS_NET_PEER_NAME, config.peerName);
      }
      if (config.peerPort) {
        span.setAttribute(SEMATTRS_NET_PEER_PORT, config.peerPort);
      }
      if (!config.peerName || !config.peerPort) {
        try {
          const clientConfig = this.connection_params || this.options;
          if (clientConfig?.url) {
            const url = new URL(clientConfig.url);
            if (!config.peerName) {
              span.setAttribute(SEMATTRS_NET_PEER_NAME, url.hostname);
            }
            if (!config.peerPort) {
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
            try {
              config.responseHook(span, response);
            } catch {
              // Ignore errors from user-provided hooks
            }
          }
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return response;
        };

        const onError = (error: Error): never => {
          if (config.responseHook) {
            try {
              config.responseHook(span, undefined);
            } catch {
              // Ignore errors from user-provided hooks
            }
          }
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
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
          return onError(error as Error);
        }
      });
    };
  };
}
