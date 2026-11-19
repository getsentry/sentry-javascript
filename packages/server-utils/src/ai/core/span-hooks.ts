import { debug } from '@sentry/core';
import type { Span } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';

/** How a gen_ai call ended, as passed to {@link GenAiSpanHooks.onSpanEnd}. */
export interface GenAiSpanResult<TResponse> {
  /** The response as the library returned it. `undefined` for streams and failed calls. */
  response?: TResponse;
  /** Set when the call failed. */
  error?: unknown;
}

/**
 * Hooks that let an integration's users add their own attributes to its gen_ai spans. `TCall` is the same
 * call info that `recordInputs`/`recordOutputs` get, and both hooks get the same object.
 *
 * They only run for spans that are recorded. A hook that throws is logged and does not affect the call.
 */
export interface GenAiSpanHooks<TCall, TResponse = unknown> {
  /**
   * Runs after the span started and the SDK set its request attributes, in the caller's async context, so
   * it can read request-scoped state.
   */
  onSpanStart?: (span: Span, call: TCall) => void;
  /**
   * Runs after the SDK set its response attributes, right before the span ends. That can be in another
   * async context than the call, for example when a stream is consumed later.
   */
  onSpanEnd?: (span: Span, call: TCall, result: GenAiSpanResult<TResponse>) => void;
}

/** Runs {@link GenAiSpanHooks.onSpanStart}. */
export function runGenAiSpanStart<TCall>(
  hooks: Pick<GenAiSpanHooks<TCall>, 'onSpanStart'>,
  span: Span,
  call: TCall,
): void {
  const onSpanStart = hooks.onSpanStart;
  if (onSpanStart && span.isRecording()) {
    runGenAiSpanHook('onSpanStart', () => onSpanStart(span, call));
  }
}

/** Runs {@link GenAiSpanHooks.onSpanEnd}. Call it right before the span ends. */
export function runGenAiSpanEnd<TCall, TResponse>(
  hooks: GenAiSpanHooks<TCall, TResponse>,
  span: Span,
  call: TCall,
  result: GenAiSpanResult<TResponse>,
): void {
  const onSpanEnd = hooks.onSpanEnd;
  if (onSpanEnd && span.isRecording()) {
    runGenAiSpanHook('onSpanEnd', () => onSpanEnd(span, call, result));
  }
}

function runGenAiSpanHook(name: string, hook: () => void): void {
  try {
    hook();
  } catch (error) {
    DEBUG_BUILD && debug.warn(`[gen_ai] \`${name}\` threw`, error);
  }
}
