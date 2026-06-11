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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-dataloader
 * - Upstream version: @opentelemetry/instrumentation-dataloader@0.35.0
 */

import type { SpanLink } from '@sentry/core';

/* Simplified types inlined from dataloader. */

export type BatchLoadFn<K, V> = (keys: ReadonlyArray<K>) => PromiseLike<ArrayLike<V | Error>>;

/** A `DataLoader` instance. */
export interface DataLoader<K = unknown, V = unknown> {
  _batchLoadFn: BatchLoadFn<K, V>;
  _batch: { spanLinks?: SpanLink[] } | null;
  load(key: K): Promise<V>;
  loadMany(keys: ArrayLike<K>): Promise<Array<V | Error>>;
  prime(key: K, value: V | Error): this;
  clear(key: K): this;
  clearAll(): this;
  name: string | undefined;
  // oxlint-disable-next-line typescript/no-explicit-any
  [key: string]: any;
}

/** The `DataLoader` class/constructor. */
export interface DataLoaderConstructor {
  // oxlint-disable-next-line typescript/no-explicit-any
  new <K, V>(batchLoadFn: BatchLoadFn<K, V>, options?: any): DataLoader<K, V>;
  prototype: DataLoader<unknown, unknown>;
}
