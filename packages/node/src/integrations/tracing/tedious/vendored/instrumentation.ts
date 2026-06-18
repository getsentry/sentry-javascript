/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-tedious
 * - Upstream version: @opentelemetry/instrumentation-tedious@0.37.0
 * - Minor TypeScript strictness adjustments
 * - Span creation migrated to the @sentry/core API; origin folded into span creation
 */

import * as api from '@opentelemetry/api';
import { EventEmitter } from 'events';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { DB_NAME, DB_STATEMENT, DB_SYSTEM, DB_USER } from '@sentry/conventions/attributes';
import { DB_SYSTEM_VALUE_MSSQL, ATTR_DB_SQL_TABLE, ATTR_NET_PEER_NAME, ATTR_NET_PEER_PORT } from './semconv';
import type * as tedious from './tedious-types';
import { getSpanName, once } from './utils';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  withActiveSpan,
} from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-tedious';

const CURRENT_DATABASE = Symbol('opentelemetry.instrumentation-tedious.current-database');

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

export class TediousInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  static readonly COMPONENT = 'tedious';

  constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
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
            this._wrap(ConnectionPrototype, method, this._patchQuery(method) as any);
          }

          if (isWrapped(ConnectionPrototype.connect)) {
            this._unwrap(ConnectionPrototype, 'connect');
          }
          // oxlint-disable-next-line typescript/unbound-method
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

  private _patchQuery(operation: string) {
    return (originalMethod: UnknownFunction): UnknownFunction => {
      const thisPlugin = this;

      function patchedMethod(this: ApproxConnection, request: ApproxRequest) {
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

        const attributes: api.Attributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.otel.tedious',
          // eslint-disable-next-line typescript/no-deprecated
          [DB_SYSTEM]: DB_SYSTEM_VALUE_MSSQL,
          // eslint-disable-next-line typescript/no-deprecated
          [DB_NAME]: databaseName,
          // >=4 uses `authentication` object; older versions just userName and password pair
          // eslint-disable-next-line typescript/no-deprecated
          [DB_USER]: this.config?.userName ?? this.config?.authentication?.options?.userName,
          // eslint-disable-next-line typescript/no-deprecated
          [DB_STATEMENT]: sql,
          // eslint-disable-next-line typescript/no-deprecated
          [ATTR_DB_SQL_TABLE]: request.table,
          // eslint-disable-next-line typescript/no-deprecated
          [ATTR_NET_PEER_NAME]: this.config?.server,
          // eslint-disable-next-line typescript/no-deprecated
          [ATTR_NET_PEER_PORT]: this.config?.options?.port,
        };
        const span = startInactiveSpan({
          name: getSpanName(operation, databaseName, sql, request.table),
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
              code: SPAN_STATUS_ERROR,
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

        return withActiveSpan(span, () => originalMethod.apply(this, arguments as unknown as any[]));
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
      return function (this: any, err: Error | undefined | null, _rowCount?: number, _rows?: any) {
        endSpan(err);
        return originalCallback.apply(this, arguments);
      };
    };
  }
}
