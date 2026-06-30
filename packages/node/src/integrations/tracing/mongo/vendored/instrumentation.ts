/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-mongodb
 * - Upstream version: @opentelemetry/instrumentation-mongodb@0.71.0
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 * - Dropped the OTel connection-usage metrics (no Sentry MeterProvider consumes them) and the
 *   session/connect patches that existed only to feed them
 * - Dropped the env-gated stable-semconv dual emission; only the (default) old semantic
 *   conventions are emitted, matching the previous default span output
 */

import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import type { WireProtocolInternal } from './internal-types';
import * as patches from './patches';

const PACKAGE_NAME = '@sentry/instrumentation-mongodb';

/** mongodb instrumentation plugin */
export class MongoDBInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  public init(): InstrumentationNodeModuleDefinition[] {
    const { v3PatchConnection, v3UnpatchConnection } = this._getV3ConnectionPatches();

    const { v4PatchConnectionCallback, v4PatchConnectionPromise, v4UnpatchConnection } = this._getV4ConnectionPatches();
    const { v4PatchConnectionPool, v4UnpatchConnectionPool } = this._getV4ConnectionPoolPatches();

    return [
      new InstrumentationNodeModuleDefinition('mongodb', ['>=3.3.0 <4'], undefined, undefined, [
        new InstrumentationNodeModuleFile(
          'mongodb/lib/core/wireprotocol/index.js',
          ['>=3.3.0 <4'],
          v3PatchConnection,
          v3UnpatchConnection,
        ),
      ]),
      new InstrumentationNodeModuleDefinition('mongodb', ['>=4.0.0 <8'], undefined, undefined, [
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection.js',
          ['>=4.0.0 <6.4'],
          v4PatchConnectionCallback,
          v4UnpatchConnection,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection.js',
          ['>=6.4.0 <8'],
          v4PatchConnectionPromise,
          v4UnpatchConnection,
        ),
        new InstrumentationNodeModuleFile(
          'mongodb/lib/cmap/connection_pool.js',
          ['>=4.0.0 <6.4'],
          v4PatchConnectionPool,
          v4UnpatchConnectionPool,
        ),
      ]),
    ];
  }

  private _getV3ConnectionPatches<T extends WireProtocolInternal>() {
    return {
      v3PatchConnection: (moduleExports: T) => {
        // patch insert operation
        if (isWrapped(moduleExports.insert)) {
          this._unwrap(moduleExports, 'insert');
        }
        this._wrap(moduleExports, 'insert', patches.getV3PatchOperation('insert'));
        // patch remove operation
        if (isWrapped(moduleExports.remove)) {
          this._unwrap(moduleExports, 'remove');
        }
        this._wrap(moduleExports, 'remove', patches.getV3PatchOperation('remove'));
        // patch update operation
        if (isWrapped(moduleExports.update)) {
          this._unwrap(moduleExports, 'update');
        }
        this._wrap(moduleExports, 'update', patches.getV3PatchOperation('update'));
        // patch other command
        if (isWrapped(moduleExports.command)) {
          this._unwrap(moduleExports, 'command');
        }
        this._wrap(moduleExports, 'command', patches.getV3PatchCommand());
        // patch query
        if (isWrapped(moduleExports.query)) {
          this._unwrap(moduleExports, 'query');
        }
        this._wrap(moduleExports, 'query', patches.getV3PatchFind());
        // patch get more operation on cursor
        if (isWrapped(moduleExports.getMore)) {
          this._unwrap(moduleExports, 'getMore');
        }
        this._wrap(moduleExports, 'getMore', patches.getV3PatchCursor());
        return moduleExports;
      },
      v3UnpatchConnection: (moduleExports?: T) => {
        if (moduleExports === undefined) return;
        this._unwrap(moduleExports, 'insert');
        this._unwrap(moduleExports, 'remove');
        this._unwrap(moduleExports, 'update');
        this._unwrap(moduleExports, 'command');
        this._unwrap(moduleExports, 'query');
        this._unwrap(moduleExports, 'getMore');
      },
    };
  }

  private _getV4ConnectionPoolPatches() {
    return {
      v4PatchConnectionPool: (moduleExports: any) => {
        const poolPrototype = moduleExports.ConnectionPool.prototype;

        if (isWrapped(poolPrototype.checkOut)) {
          this._unwrap(poolPrototype, 'checkOut');
        }

        this._wrap(poolPrototype, 'checkOut', patches.getV4ConnectionPoolCheckOut());
        return moduleExports;
      },
      v4UnpatchConnectionPool: (moduleExports?: any) => {
        if (moduleExports === undefined) return;

        this._unwrap(moduleExports.ConnectionPool.prototype, 'checkOut');
      },
    };
  }

  private _getV4ConnectionPatches() {
    return {
      v4PatchConnectionCallback: (moduleExports: any) => {
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports.Connection.prototype, 'command');
        }

        this._wrap(moduleExports.Connection.prototype, 'command', patches.getV4PatchCommandCallback());
        return moduleExports;
      },
      v4PatchConnectionPromise: (moduleExports: any) => {
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports.Connection.prototype, 'command');
        }

        this._wrap(moduleExports.Connection.prototype, 'command', patches.getV4PatchCommandPromise());
        return moduleExports;
      },
      v4UnpatchConnection: (moduleExports?: any) => {
        if (moduleExports === undefined) return;
        this._unwrap(moduleExports.Connection.prototype, 'command');
      },
    };
  }
}
