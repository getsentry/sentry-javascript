export const FLUE_INTEGRATION_NAME = 'Flue' as const;

export const FLUE_MODULE_NAME = '@flue/runtime';

export const FLUE_ORIGIN = 'auto.ai.flue';

/**
 * Identifies our registration in Flue's keyed instrumentation registry.
 *
 * `key` is optional, but without one there is no protection against registering twice: Flue
 * deduplicates on object identity, and `createFlueInstrumentation()` returns a new object each
 * call, so a second `instrument()` would silently add a second observer and interceptor and
 * duplicate every span.
 *
 * With a key, Flue handles the repeat itself — it throws `InstrumentationAlreadyInstalledError` in
 * production, and in dev disposes the previous registration and swaps in the new one, which is what
 * stops `vite dev` from stacking observers across reloads.
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
