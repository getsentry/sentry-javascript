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
 */

/**
 * Aligned with upstream Undici request shape; see `packages/node/.../node-fetch/vendored/types.ts`
 * (vendored from `@opentelemetry/instrumentation-undici`).
 */

export interface UndiciRequest {
  origin: string;
  method: string;
  path: string;
  /**
   * Serialized string of headers in the form `name: value\r\n` for v5
   * Array of strings `[key1, value1, ...]` for v6 (values may be `string | string[]`)
   */
  headers: string | (string | string[])[];
  /**
   * Helper method to add headers (from v6)
   */
  addHeader: (name: string, value: string) => void;
  throwOnError: boolean;
  completed: boolean;
  aborted: boolean;
  idempotent: boolean;
  contentLength: number | null;
  contentType: string | null;
  body: unknown;
}

export interface UndiciResponse {
  headers: Buffer[];
  statusCode: number;
  statusText: string;
}
