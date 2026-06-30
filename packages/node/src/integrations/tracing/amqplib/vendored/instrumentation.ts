/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs; the channel/connection
 *   patches live in `patches.ts` and span creation in `utils.ts`
 * - Dropped the instrumentation config and all hooks; origin is folded into span creation instead of
 *   `index.ts` hooks (see `patches.ts`/`utils.ts` for details)
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { InstrumentationNodeModuleFile } from '../../InstrumentationNodeModuleFile';
import {
  getAckAllPatch,
  getAckPatch,
  getChannelEmitPatch,
  getConfirmedPublishPatch,
  getConnectPatch,
  getConsumePatch,
  getPublishPatch,
} from './patches';
import { EndOperation } from './types';

const PACKAGE_NAME = '@sentry/instrumentation-amqplib';
const supportedVersions = ['>=0.5.5 <2'];

export class AmqplibInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationNodeModuleDefinition {
    const channelModelModuleFile = new InstrumentationNodeModuleFile(
      'amqplib/lib/channel_model.js',
      supportedVersions,
      this.patchChannelModel.bind(this),
      this.unpatchChannelModel.bind(this),
    );

    const callbackModelModuleFile = new InstrumentationNodeModuleFile(
      'amqplib/lib/callback_model.js',
      supportedVersions,
      this.patchChannelModel.bind(this),
      this.unpatchChannelModel.bind(this),
    );

    const connectModuleFile = new InstrumentationNodeModuleFile(
      'amqplib/lib/connect.js',
      supportedVersions,
      this.patchConnect.bind(this),
      this.unpatchConnect.bind(this),
    );

    const module = new InstrumentationNodeModuleDefinition('amqplib', supportedVersions, undefined, undefined, [
      channelModelModuleFile,
      connectModuleFile,
      callbackModelModuleFile,
    ]);
    return module;
  }

  private patchConnect(moduleExports: any): any {
    const unpatchedExports = this.unpatchConnect(moduleExports);
    if (!isWrapped(unpatchedExports.connect)) {
      this._wrap(unpatchedExports, 'connect', getConnectPatch);
    }
    return unpatchedExports;
  }

  private unpatchConnect(moduleExports: any): any {
    if (isWrapped(moduleExports.connect)) {
      this._unwrap(moduleExports, 'connect');
    }
    return moduleExports;
  }

  private patchChannelModel(moduleExports: any): any {
    if (!isWrapped(moduleExports.Channel.prototype.publish)) {
      this._wrap(moduleExports.Channel.prototype, 'publish', getPublishPatch);
    }
    if (!isWrapped(moduleExports.Channel.prototype.consume)) {
      this._wrap(moduleExports.Channel.prototype, 'consume', getConsumePatch);
    }
    if (!isWrapped(moduleExports.Channel.prototype.ack)) {
      this._wrap(moduleExports.Channel.prototype, 'ack', getAckPatch(false, EndOperation.Ack));
    }
    if (!isWrapped(moduleExports.Channel.prototype.nack)) {
      this._wrap(moduleExports.Channel.prototype, 'nack', getAckPatch(true, EndOperation.Nack));
    }
    if (!isWrapped(moduleExports.Channel.prototype.reject)) {
      this._wrap(moduleExports.Channel.prototype, 'reject', getAckPatch(true, EndOperation.Reject));
    }
    if (!isWrapped(moduleExports.Channel.prototype.ackAll)) {
      this._wrap(moduleExports.Channel.prototype, 'ackAll', getAckAllPatch(false, EndOperation.AckAll));
    }
    if (!isWrapped(moduleExports.Channel.prototype.nackAll)) {
      this._wrap(moduleExports.Channel.prototype, 'nackAll', getAckAllPatch(true, EndOperation.NackAll));
    }
    if (!isWrapped(moduleExports.Channel.prototype.emit)) {
      this._wrap(moduleExports.Channel.prototype, 'emit', getChannelEmitPatch);
    }
    if (!isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
      this._wrap(moduleExports.ConfirmChannel.prototype, 'publish', getConfirmedPublishPatch);
    }
    return moduleExports;
  }

  private unpatchChannelModel(moduleExports: any): any {
    if (isWrapped(moduleExports.Channel.prototype.publish)) {
      this._unwrap(moduleExports.Channel.prototype, 'publish');
    }
    if (isWrapped(moduleExports.Channel.prototype.consume)) {
      this._unwrap(moduleExports.Channel.prototype, 'consume');
    }
    if (isWrapped(moduleExports.Channel.prototype.ack)) {
      this._unwrap(moduleExports.Channel.prototype, 'ack');
    }
    if (isWrapped(moduleExports.Channel.prototype.nack)) {
      this._unwrap(moduleExports.Channel.prototype, 'nack');
    }
    if (isWrapped(moduleExports.Channel.prototype.reject)) {
      this._unwrap(moduleExports.Channel.prototype, 'reject');
    }
    if (isWrapped(moduleExports.Channel.prototype.ackAll)) {
      this._unwrap(moduleExports.Channel.prototype, 'ackAll');
    }
    if (isWrapped(moduleExports.Channel.prototype.nackAll)) {
      this._unwrap(moduleExports.Channel.prototype, 'nackAll');
    }
    if (isWrapped(moduleExports.Channel.prototype.emit)) {
      this._unwrap(moduleExports.Channel.prototype, 'emit');
    }
    if (isWrapped(moduleExports.ConfirmChannel.prototype.publish)) {
      this._unwrap(moduleExports.ConfirmChannel.prototype, 'publish');
    }
    return moduleExports;
  }
}
