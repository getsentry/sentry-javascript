export const TANSTACK_AI_INTEGRATION_NAME = 'TanStackAI' as const;

export const TANSTACK_AI_ORIGIN = 'auto.ai.tanstack_ai';

/**
 * Marks our middleware, so a `chat()` call that already has it does not get a second one.
 * `Symbol.for`, so that two copies of the SDK in one process see each other's middleware.
 */
export const TANSTACK_AI_MIDDLEWARE_BRAND = Symbol.for('sentry.tanstack-ai.middleware');
