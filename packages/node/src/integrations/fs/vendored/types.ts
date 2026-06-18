/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 * - The `createHook`/`endHook`/`requireParentSpan` config options were removed in favor of Sentry-specific options.
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as fs from 'fs';

// oxlint-disable-next-line typescript/no-explicit-any
export type GenericFunction = (...args: any[]) => unknown;

export type FunctionPropertyNames<T> = Exclude<
  {
    // oxlint-disable-next-line typescript/no-unsafe-function-type
    [K in keyof T]: T[K] extends Function ? K : never;
  }[keyof T],
  undefined
>;

export type FunctionPropertyNamesTwoLevels<T> = Exclude<
  {
    [K in keyof T]: {
      [L in keyof T[K]]: L extends string
        ? // oxlint-disable-next-line typescript/no-unsafe-function-type
          T[K][L] extends Function
          ? K extends string
            ? L extends string
              ? `${K}.${L}`
              : never
            : never
          : never
        : never;
    }[keyof T[K]];
  }[keyof T],
  undefined
>;

export type FMember = FunctionPropertyNames<typeof fs> | FunctionPropertyNamesTwoLevels<typeof fs>;
export type FPMember =
  | FunctionPropertyNames<(typeof fs)['promises']>
  | FunctionPropertyNamesTwoLevels<(typeof fs)['promises']>;

export interface FsInstrumentationConfig extends InstrumentationConfig {
  /**
   * Setting this option to `true` will include any filepath arguments from your `fs` API calls as span attributes.
   */
  recordFilePaths?: boolean;

  /**
   * Setting this option to `true` will include the error messages of failed `fs` API calls as a span attribute.
   */
  recordErrorMessagesAsSpanAttributes?: boolean;
}
