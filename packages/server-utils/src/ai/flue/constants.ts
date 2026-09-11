export const FLUE_INTEGRATION_NAME = 'Flue' as const;

export const FLUE_MODULE_NAME = '@flue/runtime';

export const FLUE_ORIGIN = 'auto.ai.flue';

/**
 * Identifies our registration in Flue's keyed instrumentation registry. A distinct key lets us
 * coexist with `@flue/opentelemetry` (which registers under its own key) and makes a repeated
 * `instrument()` call a no-op instead of throwing `InstrumentationAlreadyInstalledError`.
 */
export const FLUE_INSTRUMENTATION_KEY = Symbol.for('sentry.flue.instrumentation');

/**
 * Flue drives one LLM call through many `model` operations (one per stream read), and its `agent`
 * operation nests inside itself once per submission. Only `agent` is spanned from the interceptor,
 * and only at the outermost depth; the turn span is driven from the observation stream instead,
 * where `turn_start`/`turn` are exactly one-to-one with a model call.
 */
export const SPANNED_OPERATION_TYPE = 'agent';
