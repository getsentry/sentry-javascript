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
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 */
/* eslint-disable */

import type * as fs from 'fs';

import type * as api from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type FunctionPropertyNames<T> = Exclude<
  {
    [K in keyof T]: T[K] extends Function ? K : never;
  }[keyof T],
  undefined
>;
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

export type FunctionPropertyNamesTwoLevels<T> = Exclude<
  {
    [K in keyof T]: {
      [L in keyof T[K]]: L extends string
        ? T[K][L] extends Function
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

export type Member<F> = FunctionPropertyNames<F> | FunctionPropertyNamesTwoLevels<F>;
export type FMember = FunctionPropertyNames<typeof fs> | FunctionPropertyNamesTwoLevels<typeof fs>;
export type FPMember =
  | FunctionPropertyNames<(typeof fs)['promises']>
  | FunctionPropertyNamesTwoLevels<(typeof fs)['promises']>;

export type CreateHook = (functionName: FMember | FPMember, info: { args: ArrayLike<unknown> }) => boolean;
export type EndHook = (
  functionName: FMember | FPMember,
  info: { args: ArrayLike<unknown>; span: api.Span; error?: Error },
) => void;

export interface FsInstrumentationConfig extends InstrumentationConfig {
  createHook?: CreateHook;
  endHook?: EndHook;
  requireParentSpan?: boolean;
}
