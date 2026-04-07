/**
 * Adapted from https://github.com/evanderkoogh/otel-cf-workers/blob/effeb549f0a4ed1c55ea0c4f0d8e8e37e5494fb3/src/instrumentation/env.ts
 *
 * BSD 3-Clause License
 *
 * Copyright (c) 2023, Erwin van der Koogh
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { DurableObjectNamespace } from '@cloudflare/workers-types';

/**
 * Checks if a value is a JSRPC proxy (service binding).
 *
 * JSRPC proxies return a truthy value for ANY property access, including
 * properties that don't exist. This makes other duck-type checks unreliable
 * unless we exclude JSRPC first.
 *
 * Must be checked before other binding type checks.
 */
export function isJSRPC(item: unknown): item is Service {
  try {
    return !!(item as Record<string, unknown>)[`__some_property_that_will_never_exist__${Math.random()}`];
  } catch {
    return false;
  }
}

const isNotJSRPC = (item: unknown): item is Record<string, unknown> => !isJSRPC(item);

/**
 * Duck-type check for DurableObjectNamespace bindings.
 * DurableObjectNamespace has `idFromName`, `idFromString`, `get`, `newUniqueId`.
 */
export function isDurableObjectNamespace(item: unknown): item is DurableObjectNamespace {
  return item != null && isNotJSRPC(item) && typeof item.idFromName === 'function';
}
