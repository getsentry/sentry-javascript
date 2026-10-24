export const TANSTACK_AI_INTEGRATION_NAME = 'TanStackAI' as const;

export const TANSTACK_AI_ORIGIN = 'auto.ai.tanstack_ai';

/**
 * Marks the middleware so auto-injection can tell whether the app already passed one to `chat()`.
 * `Symbol.for` so two copies of the SDK in one process still recognise each other's middleware.
 */
export const TANSTACK_AI_MIDDLEWARE_BRAND = Symbol.for('sentry.tanstack-ai.middleware');
