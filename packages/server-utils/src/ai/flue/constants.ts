export const FLUE_ORIGIN = 'auto.ai.flue';

/**
 * Identifies our registration in Flue's keyed instrumentation registry. A distinct key lets us
 * coexist with `@flue/opentelemetry` (which registers under its own key) and makes a repeated
 * `instrument()` call a no-op instead of throwing `InstrumentationAlreadyInstalledError`.
 */
export const FLUE_INSTRUMENTATION_KEY = Symbol.for('sentry.flue.instrumentation');

/**
 * The Flue execution operations we act on.
 *
 * Only `AGENT` is spanned from the interceptor, and only at the outermost depth: Flue drives one
 * LLM call through many `MODEL` operations (one per stream read), and its `AGENT` operation nests
 * inside itself once per submission. The turn span is driven from the observation stream instead,
 * where `turn_start`/`turn` are exactly one-to-one with a model call. `MODEL` and `TOOL` are
 * intercepted only to make the already-open span active for the duration of the operation.
 */
export const FLUE_OPERATION = {
  AGENT: 'agent',
  MODEL: 'model',
  TOOL: 'tool',
} as const;

/**
 * Cap on tracked turn and tool spans, matching `MAX_TRACKED_MASTRA_SPANS`. Both maps are keyed off
 * an id that is only removed when the matching end observation arrives; a stream that is abandoned
 * mid-turn never emits one, so without a cap the map grows for the lifetime of the process.
 */
export const MAX_TRACKED_FLUE_SPANS = 1000;
