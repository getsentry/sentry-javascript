/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-hapi
 * - Upstream version: @opentelemetry/instrumentation-hapi@0.64.0
 * - Types vendored from @hapi/hapi as simplified interfaces
 */
/* eslint-disable */

import type * as Hapi from './hapi-types';

export const HapiComponentName = '@hapi/hapi';

/**
 * This symbol is used to mark a Hapi route handler or server extension handler as
 * already patched, since its possible to use these handlers multiple times
 * i.e. when allowing multiple versions of one plugin, or when registering a plugin
 * multiple times on different servers.
 */
export const handlerPatched: unique symbol = Symbol('hapi-handler-patched');

export type HapiServerRouteInputMethod = (route: HapiServerRouteInput) => void;

export type HapiServerRouteInput = PatchableServerRoute | PatchableServerRoute[];

export type PatchableServerRoute = Hapi.ServerRoute<any> & {
  [handlerPatched]?: boolean;
};

export type HapiPluginObject<T> = Hapi.ServerRegisterPluginObject<T>;

export type HapiPluginInput<T> = HapiPluginObject<T> | Array<HapiPluginObject<T>>;

export type RegisterFunction<T> = (plugin: HapiPluginInput<T>, options?: Hapi.ServerRegisterOptions) => Promise<void>;

export type PatchableExtMethod = Hapi.Lifecycle.Method & {
  [handlerPatched]?: boolean;
};

export type ServerExtDirectInput = [
  Hapi.ServerRequestExtType,
  Hapi.Lifecycle.Method,
  (Hapi.ServerExtOptions | undefined)?,
];

export const HapiLayerType = {
  ROUTER: 'router',
  PLUGIN: 'plugin',
  EXT: 'server.ext',
};

export const HapiLifecycleMethodNames = new Set([
  'onPreAuth',
  'onCredentials',
  'onPostAuth',
  'onPreHandler',
  'onPostHandler',
  'onPreResponse',
  'onRequest',
]);
