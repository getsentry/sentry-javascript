/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 */

/* oxlint-disable typescript/no-deprecated */

import { SpanKind } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  getActiveSpan,
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import {
  ATTR_DB_NAME,
  ATTR_DB_OPERATION,
  ATTR_DB_SQL_TABLE,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_DB_USER,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  ATTR_NET_TRANSPORT,
} from './semconv';
import * as utils from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-knex';
const ORIGIN = 'auto.db.otel.knex';

const MODULE_NAME = 'knex';
const SUPPORTED_VERSIONS = [
  // use "lib/execution" for runner.js, "lib" for client.js as basepath, latest tested 0.95.6
  '>=0.22.0 <4',
  // use "lib" as basepath
  '>=0.10.0 <0.18.0',
  '>=0.19.0 <0.22.0',
  // use "src" as basepath
  '>=0.18.0 <0.19.0',
];

// Max length of the query text captured in the `db.statement` attribute; ".." is appended when truncated.
const MAX_QUERY_LENGTH = 1022;

const parentSpanSymbol = Symbol('sentry.instrumentation-knex.parent-span');

export class KnexInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition {
    const module = new InstrumentationNodeModuleDefinition(MODULE_NAME, SUPPORTED_VERSIONS);

    module.files.push(
      this._getClientNodeModuleFileInstrumentation('src'),
      this._getClientNodeModuleFileInstrumentation('lib'),
      this._getRunnerNodeModuleFileInstrumentation('src'),
      this._getRunnerNodeModuleFileInstrumentation('lib'),
      this._getRunnerNodeModuleFileInstrumentation('lib/execution'),
    );

    return module;
  }

  private _getRunnerNodeModuleFileInstrumentation(basePath: string): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/runner.js`,
      SUPPORTED_VERSIONS,
      (Runner: any, moduleVersion?: string) => {
        this._ensureWrapped(Runner.prototype, 'query', this._createQueryWrapper(moduleVersion));
        return Runner;
      },
      (Runner: any) => {
        this._unwrap(Runner.prototype, 'query');
        return Runner;
      },
    );
  }

  private _getClientNodeModuleFileInstrumentation(basePath: string): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/client.js`,
      SUPPORTED_VERSIONS,
      (Client: any) => {
        this._ensureWrapped(Client.prototype, 'queryBuilder', this._storeContext.bind(this));
        this._ensureWrapped(Client.prototype, 'schemaBuilder', this._storeContext.bind(this));
        this._ensureWrapped(Client.prototype, 'raw', this._storeContext.bind(this));
        return Client;
      },
      (Client: any) => {
        this._unwrap(Client.prototype, 'queryBuilder');
        this._unwrap(Client.prototype, 'schemaBuilder');
        this._unwrap(Client.prototype, 'raw');
        return Client;
      },
    );
  }

  private _createQueryWrapper(moduleVersion?: string) {
    return function wrapQuery(original: (...args: any[]) => any) {
      return function wrapped_logging_method(this: any, query: any) {
        const config = this.client.config;

        const table = utils.extractTableName(this.builder);
        const operation = query?.method;
        const connectionString = config?.connection?.connectionString;
        const name =
          config?.connection?.filename ||
          config?.connection?.database ||
          utils.extractDatabaseFromConnectionString(connectionString);

        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          'knex.version': moduleVersion,
          [ATTR_DB_SYSTEM]: utils.mapSystem(this.client.driverName),
          [ATTR_DB_SQL_TABLE]: table,
          [ATTR_DB_OPERATION]: operation,
          [ATTR_DB_USER]: config?.connection?.user,
          [ATTR_DB_NAME]: name,
          [ATTR_NET_PEER_NAME]: config?.connection?.host ?? utils.extractHostFromConnectionString(connectionString),
          [ATTR_NET_PEER_PORT]: config?.connection?.port ?? utils.extractPortFromConnectionString(connectionString),
          [ATTR_NET_TRANSPORT]: config?.connection?.filename === ':memory:' ? 'inproc' : undefined,
          [ATTR_DB_STATEMENT]: utils.limitLength(query?.sql, MAX_QUERY_LENGTH),
        };

        // The query builder captures the span active when it was created (see `_storeContext`).
        // `onlyIfParent` ensures we only instrument queries that run as part of an existing trace.
        const parentSpan: Span | undefined = this.builder[parentSpanSymbol] || getActiveSpan();

        const args = arguments;
        return startSpan(
          {
            name: utils.getName(name, operation, table),
            kind: SpanKind.CLIENT,
            attributes,
            parentSpan,
            onlyIfParent: true,
          },
          span =>
            // `Runner.query` returns a real, already-executing Promise, so it is safe to let
            // `startSpan` await it and auto-end the span.
            original.apply(this, args).catch((err: any) => {
              const formatter = utils.getFormatter(this);
              const fullQuery = formatter(query.sql, query.bindings || []);
              const message = err.message.replace(`${fullQuery} - `, '');
              span.setStatus({ code: SPAN_STATUS_ERROR, message });
              throw err;
            }),
        );
      };
    };
  }

  private _storeContext(original: (...args: any[]) => any) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      // Capture the span that is active when the query builder is created. The query often executes
      // in a different async context, so we reuse this span as the parent when the query runs.
      Object.defineProperty(builder, parentSpanSymbol, {
        value: getActiveSpan(),
      });
      return builder;
    };
  }

  private _ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any): void {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
