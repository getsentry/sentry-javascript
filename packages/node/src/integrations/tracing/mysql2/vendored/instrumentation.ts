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
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

import { SpanKind } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { SpanAttributes } from '@sentry/core';
import { SDK_VERSION, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, startInactiveSpan } from '@sentry/core';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import type { Connection, FormatFunction, Query, QueryError, QueryOptions } from './mysql2-types';
import { ATTR_DB_STATEMENT, ATTR_DB_SYSTEM, DB_SYSTEM_VALUE_MYSQL } from './semconv';
import { getConnectionAttributes, getConnectionPrototypeToInstrument, getQueryText, getSpanName, once } from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-mysql2';
const ORIGIN = 'auto.db.otel.mysql2';

const supportedVersions = ['>=1.4.2 <4'];

// The raw imported `mysql2` module exposes the `format` helper used to render
// parameterized queries. Typed shallowly since it is only read internally.
type MySQL2Module = { format?: FormatFunction; [key: string]: unknown };

export class MySQL2Instrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationNodeModuleDefinition[] {
    let format: FormatFunction | undefined;
    function setFormatFunction(moduleExports: MySQL2Module): void {
      if (!format && moduleExports.format) {
        format = moduleExports.format;
      }
    }
    const patch = (ConnectionPrototype: Connection): void => {
      if (isWrapped(ConnectionPrototype.query)) {
        this._unwrap(ConnectionPrototype, 'query');
      }
      this._wrap(ConnectionPrototype, 'query', this._patchQuery(format) as any);
      if (isWrapped(ConnectionPrototype.execute)) {
        this._unwrap(ConnectionPrototype, 'execute');
      }
      this._wrap(ConnectionPrototype, 'execute', this._patchQuery(format) as any);
    };
    const unpatch = (ConnectionPrototype: Connection): void => {
      this._unwrap(ConnectionPrototype, 'query');
      this._unwrap(ConnectionPrototype, 'execute');
    };
    return [
      new InstrumentationNodeModuleDefinition(
        'mysql2',
        supportedVersions,
        (moduleExports: MySQL2Module) => {
          setFormatFunction(moduleExports);
          return moduleExports;
        },
        () => {},
        [
          new InstrumentationNodeModuleFile(
            'mysql2/promise.js',
            supportedVersions,
            (moduleExports: MySQL2Module) => {
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

  private _patchQuery(format: FormatFunction | undefined) {
    const thisPlugin = this;
    return (originalQuery: Function): Function => {
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

        const attributes: SpanAttributes = {
          ...getConnectionAttributes(this.config),
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_MYSQL,
          [ATTR_DB_STATEMENT]: getQueryText(query, format, values),
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        };

        const span = startInactiveSpan({
          name: getSpanName(query),
          kind: SpanKind.CLIENT,
          attributes,
        });

        const endSpan = once((err?: QueryError | null) => {
          if (err) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: err.message });
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
            .once('result', () => {
              endSpan();
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

  private _patchCallbackQuery(endSpan: (err?: QueryError | null) => void) {
    return (originalCallback: Function) => {
      return function (...args: [err: QueryError | null, ...rest: unknown[]]) {
        endSpan(args[0]);
        return originalCallback(...args);
      };
    };
  }
}
