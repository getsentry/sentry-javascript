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
 * - Minimal vendored implementation of `TraceState` from `@opentelemetry/core`
 *   to avoid pulling in that dependency for a single class.
 * - Drops raw-string parsing and key/value validation, neither of which are
 *   used by the SDK — the W3C `tracestate` header is parsed by OTel's own
 *   propagators (which use their own `TraceState`), and every key we `set`
 *   is a known constant.
 */
import type { TraceState as TraceStateInterface } from '@opentelemetry/api';

/**
 * Minimal implementation of the W3C `tracestate` field as a `@opentelemetry/api`
 * `TraceState`. New entries are inserted at the front of the list, and updating
 * an existing key moves it to the front.
 *
 * See https://www.w3.org/TR/trace-context/#tracestate-field for the field spec.
 */
export class TraceState implements TraceStateInterface {
  private _internalState: Map<string, string> = new Map();

  /** @inheritDoc */
  public set(key: string, value: string): TraceState {
    const next = this._clone();
    if (next._internalState.has(key)) {
      next._internalState.delete(key);
    }
    next._internalState.set(key, value);
    return next;
  }

  /** @inheritDoc */
  public unset(key: string): TraceState {
    const next = this._clone();
    next._internalState.delete(key);
    return next;
  }

  /** @inheritDoc */
  public get(key: string): string | undefined {
    return this._internalState.get(key);
  }

  /** @inheritDoc */
  public serialize(): string {
    return Array.from(this._internalState.keys())
      .reverse()
      .map(key => `${key}=${this._internalState.get(key)}`)
      .join(',');
  }

  private _clone(): TraceState {
    const next = new TraceState();
    next._internalState = new Map(this._internalState);
    return next;
  }
}
