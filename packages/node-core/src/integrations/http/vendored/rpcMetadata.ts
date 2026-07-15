/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-core/src/trace/rpc-metadata.ts
 * - Upstream version: @opentelemetry/core@2.9.0
 * - `getRPCMetadata` and `deleteRPCMetadata` were removed since they're not used
 */

import type { Context, Span } from '@opentelemetry/api';
import { createContextKey } from '@opentelemetry/api';

const RPC_METADATA_KEY = createContextKey('OpenTelemetry SDK Context Key RPC_METADATA');

export enum RPCType {
  HTTP = 'http',
}

type HTTPMetadata = {
  type: RPCType.HTTP;
  route?: string;
  span: Span;
};

/**
 * Allows for future rpc metadata to be used with this mechanism
 */
export type RPCMetadata = HTTPMetadata;

/** Set the current RPC metadata on the given context. */
export function setRPCMetadata(context: Context, meta: RPCMetadata): Context {
  return context.setValue(RPC_METADATA_KEY, meta);
}
