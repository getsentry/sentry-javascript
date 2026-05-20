/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-tedious
 * - Upstream version: @opentelemetry/instrumentation-tedious@0.37.0
 * - Minor TypeScript strictness adjustments
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import { EventEmitter } from 'events';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  DB_SYSTEM_NAME_VALUE_MICROSOFT_SQL_SERVER,
} from '@opentelemetry/semantic-conventions';
import {
  DB_SYSTEM_VALUE_MSSQL,
  ATTR_DB_NAME,
  ATTR_DB_SQL_TABLE,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import type * as tedious from './tedious-types';
import { TediousInstrumentationConfig } from './types';
import { getSpanName, once } from './utils';
import { SDK_VERSION } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-tedious';

const CURRENT_DATABASE = Symbol('opentelemetry.instrumentation-tedious.current-database');

export const INJECTED_CTX = Symbol('opentelemetry.instrumentation-tedious.context-info-injected');

const PATCHED_METHODS = ['callProcedure', 'execSql', 'execSqlBatch', 'execBulkLoad', 'prepare', 'execute'];

type UnknownFunction = (...args: any[]) => any;
type ApproxConnection = EventEmitter & {
  [CURRENT_DATABASE]: string;
  config: any;
};
type ApproxRequest = EventEmitter & {
  sqlTextOrProcedure: string | undefined;
  callback: any;
  table: string | undefined;
  parametersByName: any;
};

function setDatabase(this: ApproxConnection, databaseName: string) {
  Object.defineProperty(this, CURRENT_DATABASE, {
    value: databaseName,
    writable: true,
  });
}

export class TediousInstrumentation extends InstrumentationBase<TediousInstrumentationConfig> {
  static readonly COMPONENT = 'tedious';
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;

  constructor(config: TediousInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._setSemconvStabilityFromEnv();
  }

  // Used for testing.
  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        TediousInstrumentation.COMPONENT,
        ['>=1.11.0 <20'],
        (moduleExports: typeof tedious) => {
          const ConnectionPrototype: any = moduleExports.Connection.prototype;
          for (const method of PATCHED_METHODS) {
            if (isWrapped(ConnectionPrototype[method])) {
              this._unwrap(ConnectionPrototype, method);
            }
            this._wrap(ConnectionPrototype, method, this._patchQuery(method, moduleExports) as any);
          }

          if (isWrapped(ConnectionPrototype.connect)) {
            this._unwrap(ConnectionPrototype, 'connect');
          }
          this._wrap(ConnectionPrototype, 'connect', this._patchConnect);

          return moduleExports;
        },
        (moduleExports: typeof tedious) => {
          if (moduleExports === undefined) return;
          const ConnectionPrototype: any = moduleExports.Connection.prototype;
          for (const method of PATCHED_METHODS) {
            this._unwrap(ConnectionPrototype, method);
          }
          this._unwrap(ConnectionPrototype, 'connect');
        },
      ),
    ];
  }

  private _patchConnect(original: UnknownFunction): UnknownFunction {
    return function patchedConnect(this: ApproxConnection) {
      setDatabase.call(this, this.config?.options?.database);

      // remove the listener first in case it's already added
      this.removeListener('databaseChange', setDatabase);
      this.on('databaseChange', setDatabase);

      this.once('end', () => {
        this.removeListener('databaseChange', setDatabase);
      });
      return original.apply(this, arguments as unknown as any[]);
    };
  }

  private _buildTraceparent(span: api.Span): string {
    const sc = span.spanContext();
    return `00-${sc.traceId}-${sc.spanId}-0${Number(sc.traceFlags || api.TraceFlags.NONE).toString(16)}`;
  }

  /**
   * Fire a one-off `SET CONTEXT_INFO @opentelemetry_traceparent` on the same
   * connection. Marks the request with INJECTED_CTX so our patch skips it.
   */
  private _injectContextInfo(connection: any, tediousModule: typeof tedious, traceparent: string): Promise<void> {
    return new Promise(resolve => {
      try {
        const sql = 'set context_info @opentelemetry_traceparent';
        const req = new tediousModule.Request(sql, (_err: any) => {
          resolve();
        });
        Object.defineProperty(req, INJECTED_CTX, { value: true });
        const buf = Buffer.from(traceparent, 'utf8');
        req.addParameter('opentelemetry_traceparent', (tediousModule as any).TYPES.VarBinary, buf, {
          length: buf.length,
        });

        connection.execSql(req);
      } catch {
        resolve();
      }
    });
  }

  private _shouldInjectFor(operation: string): boolean {
    return (
      operation === 'execSql' ||
      operation === 'execSqlBatch' ||
      operation === 'callProcedure' ||
      operation === 'execute'
    );
  }

  private _patchQuery(operation: string, tediousModule: typeof tedious) {
    return (originalMethod: UnknownFunction): UnknownFunction => {
      const thisPlugin = this;

      function patchedMethod(this: ApproxConnection, request: ApproxRequest) {
        // Skip our own injected request
        if ((request as any)?.[INJECTED_CTX]) {
          return originalMethod.apply(this, arguments as unknown as any[]);
        }

        if (!(request instanceof EventEmitter)) {
          thisPlugin._diag.warn(`Unexpected invocation of patched ${operation} method. Span not recorded`);
          return originalMethod.apply(this, arguments as unknown as any[]);
        }
        let procCount = 0;
        let statementCount = 0;
        const incrementStatementCount = () => statementCount++;
        const incrementProcCount = () => procCount++;
        const databaseName = this[CURRENT_DATABASE];
        const sql = (request => {
          // Required for <11.0.9
          if (request.sqlTextOrProcedure === 'sp_prepare' && request.parametersByName?.stmt?.value) {
            return request.parametersByName.stmt.value;
          }
          return request.sqlTextOrProcedure;
        })(request);

        const attributes: api.Attributes = {};
        if (thisPlugin._dbSemconvStability & SemconvStability.OLD) {
          attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_MSSQL;
          attributes[ATTR_DB_NAME] = databaseName;
          // >=4 uses `authentication` object; older versions just userName and password pair
          attributes[ATTR_DB_USER] = this.config?.userName ?? this.config?.authentication?.options?.userName;
          attributes[ATTR_DB_STATEMENT] = sql;
          attributes[ATTR_DB_SQL_TABLE] = request.table;
        }
        if (thisPlugin._dbSemconvStability & SemconvStability.STABLE) {
          // The OTel spec for "db.namespace" discusses handling for connection
          // to MSSQL "named instances". This isn't currently supported.
          //    https://opentelemetry.io/docs/specs/semconv/database/sql-server/#:~:text=%5B1%5D%20db%2Enamespace
          attributes[ATTR_DB_NAMESPACE] = databaseName;
          attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MICROSOFT_SQL_SERVER;
          attributes[ATTR_DB_QUERY_TEXT] = sql;
          attributes[ATTR_DB_COLLECTION_NAME] = request.table;
          // See https://opentelemetry.io/docs/specs/semconv/database/sql-server/#spans
          // TODO(3290): can `db.response.status_code` be added?
          // TODO(3290): is `operation` correct for `db.operation.name`
          // TODO(3290): can `db.query.summary` reliably be calculated?
          // TODO(3290): `db.stored_procedure.name`
        }
        if (thisPlugin._netSemconvStability & SemconvStability.OLD) {
          attributes[ATTR_NET_PEER_NAME] = this.config?.server;
          attributes[ATTR_NET_PEER_PORT] = this.config?.options?.port;
        }
        if (thisPlugin._netSemconvStability & SemconvStability.STABLE) {
          attributes[ATTR_SERVER_ADDRESS] = this.config?.server;
          attributes[ATTR_SERVER_PORT] = this.config?.options?.port;
        }
        const span = thisPlugin.tracer.startSpan(getSpanName(operation, databaseName, sql, request.table), {
          kind: api.SpanKind.CLIENT,
          attributes,
        });

        const endSpan = once((err?: any) => {
          request.removeListener('done', incrementStatementCount);
          request.removeListener('doneInProc', incrementStatementCount);
          request.removeListener('doneProc', incrementProcCount);
          request.removeListener('error', endSpan);
          this.removeListener('end', endSpan);

          span.setAttribute('tedious.procedure_count', procCount);
          span.setAttribute('tedious.statement_count', statementCount);
          if (err) {
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
            // TODO(3290): set `error.type` attribute?
          }
          span.end();
        });

        request.on('done', incrementStatementCount);
        request.on('doneInProc', incrementStatementCount);
        request.on('doneProc', incrementProcCount);
        request.once('error', endSpan);
        this.on('end', endSpan);

        if (typeof request.callback === 'function') {
          thisPlugin._wrap(request, 'callback', thisPlugin._patchCallbackQuery(endSpan));
        } else {
          thisPlugin._diag.error('Expected request.callback to be a function');
        }

        const runUserRequest = () => {
          return api.context.with(api.trace.setSpan(api.context.active(), span), originalMethod, this, ...arguments);
        };

        const cfg = thisPlugin.getConfig();
        const shouldInject = cfg.enableTraceContextPropagation && thisPlugin._shouldInjectFor(operation);

        if (!shouldInject) return runUserRequest();

        const traceparent = thisPlugin._buildTraceparent(span);

        void thisPlugin._injectContextInfo(this, tediousModule, traceparent).finally(runUserRequest);
      }

      Object.defineProperty(patchedMethod, 'length', {
        value: originalMethod.length,
        writable: false,
      });

      return patchedMethod;
    };
  }

  private _patchCallbackQuery(endSpan: Function) {
    return (originalCallback: Function) => {
      return function (this: any, err: Error | undefined | null, rowCount?: number, rows?: any) {
        endSpan(err);
        return originalCallback.apply(this, arguments);
      };
    };
  }
}
