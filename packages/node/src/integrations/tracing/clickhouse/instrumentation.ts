import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { type ClickHouseModuleExports,patchClickHouseClient } from './patch';
import type { ClickHouseInstrumentationConfig } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-clickhouse';
const supportedVersions = ['>=0.0.1'];

/**
 *
 */
export class ClickHouseInstrumentation extends InstrumentationBase<ClickHouseInstrumentationConfig> {
  public constructor(config: ClickHouseInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  /**
   *
   */
  public override init(): InstrumentationModuleDefinition {
    return new InstrumentationNodeModuleDefinition(
      '@clickhouse/client',
      supportedVersions,
      moduleExports =>
        patchClickHouseClient(moduleExports as ClickHouseModuleExports, {
          wrap: this._wrap.bind(this),
          unwrap: this._unwrap.bind(this),
          tracer: this.tracer,
          getConfig: this.getConfig.bind(this),
          isEnabled: this.isEnabled.bind(this),
        }),
      moduleExports => {
        const moduleExportsTyped = moduleExports as ClickHouseModuleExports;
        const ClickHouseClient = moduleExportsTyped.ClickHouseClient;
          if (ClickHouseClient && typeof ClickHouseClient === 'function' && 'prototype' in ClickHouseClient) {
            const ClickHouseClientCtor = ClickHouseClient as new () => {
              query: unknown;
              insert: unknown;
              exec: unknown;
              command: unknown;
            };
            this._unwrap(ClickHouseClientCtor.prototype, 'query');
            this._unwrap(ClickHouseClientCtor.prototype, 'insert');
            this._unwrap(ClickHouseClientCtor.prototype, 'exec');
            this._unwrap(ClickHouseClientCtor.prototype, 'command');
          }
      },
    );
  }
}
