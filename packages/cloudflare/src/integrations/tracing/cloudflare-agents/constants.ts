/**
 * Constants for Cloudflare Agents integration
 */

// =============================================================================
// OPENTELEMETRY SEMANTIC CONVENTIONS
// Re-exported from @sentry/core for consistency across SDKs
// =============================================================================

export {
  GEN_AI_AGENT_NAME_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OPERATION_TYPE_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
} from '@sentry/core';

// =============================================================================
// CLOUDFLARE AGENTS SPECIFIC
// =============================================================================

/**
 * The system identifier for Cloudflare Agents
 * Used as the value for gen_ai.system attribute
 */
export const CLOUDFLARE_AGENTS_SYSTEM = 'cloudflare_agents';

/**
 * The Sentry origin for Cloudflare Agents spans
 */
export const CLOUDFLARE_AGENTS_ORIGIN = 'auto.ai.cloudflare.agents';

/**
 * Default operation name for invoke_agent spans
 */
export const DEFAULT_INVOKE_AGENT_OPERATION = 'invoke_agent';

/**
 * Internal lifecycle methods that should NOT be instrumented.
 * These are framework methods that don't represent entry points.
 */
export const INTERNAL_METHODS = ['setState', 'broadcast', 'onClose', 'onError', 'onStateUpdate'] as const;

/**
 * Known entry point methods that SHOULD be instrumented.
 * These represent external calls into the agent.
 */
export const LIFECYCLE_ENTRY_POINTS = [
  'onRequest', // HTTP handler
  'onConnect', // WebSocket connection handler
  'onMessage', // WebSocket message handler
] as const;

export type LifecycleEntryPoint = (typeof LIFECYCLE_ENTRY_POINTS)[number];
