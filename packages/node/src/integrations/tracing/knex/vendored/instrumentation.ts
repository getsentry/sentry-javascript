/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-knex
 * - Upstream version: @opentelemetry/instrumentation-knex@0.62.0
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import * as api from '@opentelemetry/api';
import { SDK_VERSION } from '@sentry/core';
import * as constants from './constants';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import * as utils from './utils';
import { KnexInstrumentationConfig } from './types';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
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

const PACKAGE_NAME = '@sentry/instrumentation-knex';

const contextSymbol = Symbol('opentelemetry.instrumentation-knex.context');
const DEFAULT_CONFIG: KnexInstrumentationConfig = {
  maxQueryLength: 1022,
  requireParentSpan: false,
};

export class KnexInstrumentation extends InstrumentationBase<KnexInstrumentationConfig> {
  private _semconvStability: SemconvStability;

  constructor(config: KnexInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, { ...DEFAULT_CONFIG, ...config });

    this._semconvStability = semconvStabilityFromStr('database', process.env.OTEL_SEMCONV_STABILITY_OPT_IN);
  }

  override setConfig(config: KnexInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  init() {
    const module = new InstrumentationNodeModuleDefinition(constants.MODULE_NAME, constants.SUPPORTED_VERSIONS);

    module.files.push(
      this.getClientNodeModuleFileInstrumentation('src'),
      this.getClientNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('src'),
      this.getRunnerNodeModuleFileInstrumentation('lib'),
      this.getRunnerNodeModuleFileInstrumentation('lib/execution'),
    );

    return module;
  }

  private getRunnerNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/runner.js`,
      constants.SUPPORTED_VERSIONS,
      (Runner: any, moduleVersion?: string) => {
        this.ensureWrapped(Runner.prototype, 'query', this.createQueryWrapper(moduleVersion));
        return Runner;
      },
      (Runner: any, _moduleVersion?: string) => {
        this._unwrap(Runner.prototype, 'query');
        return Runner;
      },
    );
  }

  private getClientNodeModuleFileInstrumentation(basePath: string) {
    return new InstrumentationNodeModuleFile(
      `knex/${basePath}/client.js`,
      constants.SUPPORTED_VERSIONS,
      (Client: any) => {
        this.ensureWrapped(Client.prototype, 'queryBuilder', this.storeContext.bind(this));
        this.ensureWrapped(Client.prototype, 'schemaBuilder', this.storeContext.bind(this));
        this.ensureWrapped(Client.prototype, 'raw', this.storeContext.bind(this));
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

  private createQueryWrapper(moduleVersion?: string) {
    const instrumentation = this;

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
        const { maxQueryLength } = instrumentation.getConfig();

        const attributes: api.Attributes = {
          'knex.version': moduleVersion,
        };
        const transport = config?.connection?.filename === ':memory:' ? 'inproc' : undefined;

        if (instrumentation._semconvStability & SemconvStability.OLD) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM]: utils.mapSystem(this.client.driverName),
            [ATTR_DB_SQL_TABLE]: table,
            [ATTR_DB_OPERATION]: operation,
            [ATTR_DB_USER]: config?.connection?.user,
            [ATTR_DB_NAME]: name,
            [ATTR_NET_PEER_NAME]: config?.connection?.host ?? utils.extractHostFromConnectionString(connectionString),
            [ATTR_NET_PEER_PORT]: config?.connection?.port ?? utils.extractPortFromConnectionString(connectionString),
            [ATTR_NET_TRANSPORT]: transport,
          });
        }
        if (instrumentation._semconvStability & SemconvStability.STABLE) {
          Object.assign(attributes, {
            [ATTR_DB_SYSTEM_NAME]: utils.mapSystem(this.client.driverName),
            [ATTR_DB_COLLECTION_NAME]: table,
            [ATTR_DB_OPERATION_NAME]: operation,
            [ATTR_DB_NAMESPACE]: name,
            [ATTR_SERVER_ADDRESS]: config?.connection?.host ?? utils.extractHostFromConnectionString(connectionString),
            [ATTR_SERVER_PORT]: config?.connection?.port ?? utils.extractPortFromConnectionString(connectionString),
          });
        }
        if (maxQueryLength) {
          const queryText = utils.limitLength(query?.sql, maxQueryLength);
          if (instrumentation._semconvStability & SemconvStability.STABLE) {
            attributes[ATTR_DB_QUERY_TEXT] = queryText;
          }
          if (instrumentation._semconvStability & SemconvStability.OLD) {
            attributes[ATTR_DB_STATEMENT] = queryText;
          }
        }

        const parentContext = this.builder[contextSymbol] || api.context.active();
        const parentSpan = api.trace.getSpan(parentContext);
        const hasActiveParent = parentSpan && api.trace.isSpanContextValid(parentSpan.spanContext());
        if (instrumentation._config.requireParentSpan && !hasActiveParent) {
          return original.bind(this)(...arguments);
        }

        const span = instrumentation.tracer.startSpan(
          utils.getName(name, operation, table),
          {
            kind: api.SpanKind.CLIENT,
            attributes,
          },
          parentContext,
        );
        const spanContext = api.trace.setSpan(api.context.active(), span);

        return api.context
          .with(spanContext, original, this, ...arguments)
          .then((result: unknown) => {
            span.end();
            return result;
          })
          .catch((err: any) => {
            const formatter = utils.getFormatter(this);
            const fullQuery = formatter(query.sql, query.bindings || []);
            const message = err.message.replace(fullQuery + ' - ', '');
            const exc = utils.otelExceptionFromKnexError(err, message);
            span.recordException(exc);
            span.setStatus({ code: api.SpanStatusCode.ERROR, message });
            span.end();
            throw err;
          });
      };
    };
  }

  private storeContext(original: Function) {
    return function wrapped_logging_method(this: any) {
      const builder = original.apply(this, arguments);
      Object.defineProperty(builder, contextSymbol, {
        value: api.context.active(),
      });
      return builder;
    };
  }

  ensureWrapped(obj: any, methodName: string, wrapper: (original: any) => any) {
    if (isWrapped(obj[methodName])) {
      this._unwrap(obj, methodName);
    }
    this._wrap(obj, methodName, wrapper);
  }
}
