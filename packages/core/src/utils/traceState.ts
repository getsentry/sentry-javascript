import type { SpanContextData, TraceState as TraceStateInterface } from '../types/span';
import { baggageHeaderToDynamicSamplingContext } from './baggage';

// These are aligned with OpenTelemetry trace flags
export const TRACE_FLAG_NONE = 0x0;
export const TRACE_FLAG_SAMPLED = 0x1;

/**
 * Trace state key under which the DSC is stored as a serialized baggage header.
 */
export const SENTRY_TRACE_STATE_DSC = 'sentry.dsc';

/**
 * Trace state key marking a span context as carrying a definite negative sampling
 * decision, as opposed to a deferred one (e.g. in Tracing without Performance).
 * Both look the same on `traceFlags` (`NONE`), so this key disambiguates them.
 */
export const SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING = 'sentry.sampled_not_recording';

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

/**
 * Minimal implementation of the W3C `tracestate` field as an OpenTelemetry-aligned
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

/**
 * Build an OTel-aligned span context from a tri-state Sentry sampling decision.
 *
 * `traceFlags` alone cannot express the difference between "sampled out" and "no
 * decision yet" (both are `NONE`), so a definite negative decision is additionally
 * marked via the `SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING` trace state entry.
 * Use `getSamplingDecision` to read the decision back out of a span context.
 */
export function buildSpanContext(traceId: string, spanId: string, sampled: boolean | undefined): SpanContextData {
  return {
    spanId,
    traceId,
    traceFlags: sampled ? TRACE_FLAG_SAMPLED : TRACE_FLAG_NONE,
    traceState: sampled === false ? new TraceState().set(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING, '1') : undefined,
  };
}

/**
 * OpenTelemetry only knows about SAMPLED or NONE decision,
 * but for us it is important to differentiate between deferred and unsampled.
 *
 * Both of these are identified as `traceFlags === TRACE_FLAG_NONE`,
 * but we additionally look at a special trace state entry to differentiate between them.
 */
export function getSamplingDecision(spanContext: SpanContextData): boolean | undefined {
  const { traceFlags, traceState } = spanContext;

  // If the trace flag is `SAMPLED`, we interpret this as sampled.
  // If it is `NONE`, it could mean either it was sampled to be not recording,
  // or that no sampling decision was made yet. For us this is an important difference,
  // so we look at `SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING` to identify which it is.
  if (traceFlags === TRACE_FLAG_SAMPLED) {
    return true;
  }

  if (traceState?.get(SENTRY_TRACE_STATE_SAMPLED_NOT_RECORDING) === '1') {
    return false;
  }

  // Fall back to the DSC as a last resort, which may also contain `sampled`...
  const dscString = traceState?.get(SENTRY_TRACE_STATE_DSC);
  const dsc = dscString ? baggageHeaderToDynamicSamplingContext(dscString) : undefined;

  if (dsc?.sampled === 'true') {
    return true;
  }
  if (dsc?.sampled === 'false') {
    return false;
  }

  return undefined;
}
