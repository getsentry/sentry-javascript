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
 * - Vendored locally from @opentelemetry/instrumentation to work around a Bun
 *   --bytecode bug (https://github.com/getsentry/sentry-javascript/issues/21256).
 * - The upstream class imports `normalize` via an indirect platform/index
 *   re-export chain, which Bun's bytecode bundler renames and loses scope for.
 * - This copy imports `normalize` directly from 'path' to break that chain.
 */

import { normalize } from 'path';
import type { InstrumentationModuleFile } from '@opentelemetry/instrumentation';

export class InstrumentationNodeModuleFile implements InstrumentationModuleFile {
  public name: string;
  public supportedVersions: string[];
  public patch: (moduleExports: any, moduleVersion?: string) => any;
  public unpatch: (moduleExports?: any, moduleVersion?: string) => void;

  constructor(
    name: string,
    supportedVersions: string[],
    patch: (moduleExports: any, moduleVersion?: string) => any,
    unpatch: (moduleExports?: any, moduleVersion?: string) => void,
  ) {
    this.name = normalize(name);
    this.supportedVersions = supportedVersions;
    this.patch = patch;
    this.unpatch = unpatch;
  }
}
