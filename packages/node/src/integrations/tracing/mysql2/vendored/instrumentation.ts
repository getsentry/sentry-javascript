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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mysql2
 * - Upstream version: @opentelemetry/instrumentation-mysql2@0.64.0
 * - Types from 'mysql2' inlined as simplified interfaces
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import { SDK_VERSION } from '@sentry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { DB_SYSTEM_VALUE_MYSQL, ATTR_DB_STATEMENT, ATTR_DB_SYSTEM } from './semconv';
import { addSqlCommenterComment } from '../../utils/sql-common';
import type { Connection, Query, QueryOptions, QueryError, FieldPacket, FormatFunction } from './mysql2-types';
import { MySQL2InstrumentationConfig } from './types';
import { getConnectionAttributes, getConnectionPrototypeToInstrument, getQueryText, getSpanName, once } from './utils';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  DB_SYSTEM_NAME_VALUE_MYSQL,
} from '@opentelemetry/semantic-conventions';

const PACKAGE_NAME = '@sentry/instrumentation-mysql2';

const supportedVersions = ['>=1.4.2 <4'];

export class MySQL2Instrumentation extends InstrumentationBase<MySQL2InstrumentationConfig> {
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;

  constructor(config: MySQL2InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
    this._setSemconvStabilityFromEnv();
  }

  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr('http', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
    this._dbSemconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  protected init() {
    let format: FormatFunction | undefined;
    function setFormatFunction(moduleExports: any) {
      if (!format && moduleExports.format) {
        format = moduleExports.format;
      }
    }
    const patch = (ConnectionPrototype: Connection) => {
      if (isWrapped(ConnectionPrototype.query)) {
        this._unwrap(ConnectionPrototype, 'query');
      }
      this._wrap(ConnectionPrototype, 'query', this._patchQuery(format, false) as any);
      if (isWrapped(ConnectionPrototype.execute)) {
        this._unwrap(ConnectionPrototype, 'execute');
      }
      this._wrap(ConnectionPrototype, 'execute', this._patchQuery(format, true) as any);
    };
    const unpatch = (ConnectionPrototype: Connection) => {
      this._unwrap(ConnectionPrototype, 'query');
      this._unwrap(ConnectionPrototype, 'execute');
    };
    return [
      new InstrumentationNodeModuleDefinition(
        'mysql2',
        supportedVersions,
        (moduleExports: any) => {
          setFormatFunction(moduleExports);
          return moduleExports;
        },
        () => {},
        [
          new InstrumentationNodeModuleFile(
            'mysql2/promise.js',
            supportedVersions,
            (moduleExports: any) => {
              setFormatFunction(moduleExports);
              return moduleExports;
            },
            () => {},
          ),
          new InstrumentationNodeModuleFile(
            'mysql2/lib/connection.js',
            supportedVersions,
            (moduleExports: any) => {
              const ConnectionPrototype: Connection = getConnectionPrototypeToInstrument(moduleExports);
              patch(ConnectionPrototype);
              return moduleExports;
            },
            (moduleExports: any) => {
              if (moduleExports === undefined) return;
              const ConnectionPrototype: Connection = getConnectionPrototypeToInstrument(moduleExports);
              unpatch(ConnectionPrototype);
            },
          ),
        ],
      ),
    ];
  }

  private _patchQuery(format: FormatFunction | undefined, isPrepared: boolean) {
    return (originalQuery: Function): Function => {
      const thisPlugin = this;
      return function query(
        this: Connection,
        query: string | Query | QueryOptions,
        _valuesOrCallback?: unknown[] | Function,
        _callback?: Function,
      ) {
        let values;
        if (Array.isArray(_valuesOrCallback)) {
          values = _valuesOrCallback;
        } else if (arguments[2]) {
          values = [_valuesOrCallback];
        }
        const { maskStatement, maskStatementHook, responseHook } = thisPlugin.getConfig();

        const attributes: api.Attributes = getConnectionAttributes(
          this.config,
          thisPlugin._dbSemconvStability,
          thisPlugin._netSemconvStability,
        );
        const dbQueryText = getQueryText(query, format, values, maskStatement, maskStatementHook);
        if (thisPlugin._dbSemconvStability & SemconvStability.OLD) {
          attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_MYSQL;
          attributes[ATTR_DB_STATEMENT] = dbQueryText;
        }
        if (thisPlugin._dbSemconvStability & SemconvStability.STABLE) {
          attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_MYSQL;
          attributes[ATTR_DB_QUERY_TEXT] = dbQueryText;
        }

        const span = thisPlugin.tracer.startSpan(getSpanName(query), {
          kind: api.SpanKind.CLIENT,
          attributes,
        });

        if (!isPrepared && thisPlugin.getConfig().addSqlCommenterCommentToQueries) {
          arguments[0] = query =
            typeof query === 'string'
              ? addSqlCommenterComment(span, query)
              : Object.assign(query, {
                  sql: addSqlCommenterComment(span, query.sql),
                });
        }

        const endSpan = once((err?: any, results?: any) => {
          if (err) {
            span.setStatus({
              code: api.SpanStatusCode.ERROR,
              message: err.message,
            });
          } else {
            if (typeof responseHook === 'function') {
              safeExecuteInTheMiddle(
                () => {
                  responseHook(span, {
                    queryResults: results,
                  });
                },
                err => {
                  if (err) {
                    thisPlugin._diag.warn('Failed executing responseHook', err);
                  }
                },
                true,
              );
            }
          }

          span.end();
        });

        if (arguments.length === 1) {
          if (typeof (query as any).onResult === 'function') {
            thisPlugin._wrap(query as any, 'onResult', thisPlugin._patchCallbackQuery(endSpan));
          }

          const streamableQuery: Query = originalQuery.apply(this, arguments);

          streamableQuery
            .once('error', (err: any) => {
              endSpan(err);
            })
            .once('result', (results: any) => {
              endSpan(undefined, results);
            });

          return streamableQuery;
        }

        if (typeof arguments[1] === 'function') {
          thisPlugin._wrap(arguments, 1, thisPlugin._patchCallbackQuery(endSpan));
        } else if (typeof arguments[2] === 'function') {
          thisPlugin._wrap(arguments, 2, thisPlugin._patchCallbackQuery(endSpan));
        }

        return originalQuery.apply(this, arguments);
      };
    };
  }

  private _patchCallbackQuery(endSpan: Function) {
    return (originalCallback: Function) => {
      return function (err: QueryError | null, results?: any, _fields?: FieldPacket[]) {
        endSpan(err, results);
        return originalCallback(...arguments);
      };
    };
  }
}
