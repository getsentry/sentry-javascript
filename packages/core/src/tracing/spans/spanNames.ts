// This file contains constants for fallback span names to be used, when no
// better-suited, low-cardinality span name is available.
// Only relevant when span streaming is enabled.

/**
 * Fallback name for pageload spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#browser-pageload
 */
export const PAGELOAD_SPAN_NAME_FALLBACK = 'Pageload';

/**
 * Fallback name for navigation spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#browser-navigation
 */
export const NAVIGATION_SPAN_NAME_FALLBACK = 'Navigation';

/**
 * Fallback name for db spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#db-queries
 */
export const DB_SPAN_NAME_FALLBACK = 'Database operation';

/**
 * Fallback name for gen_ai agent spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#gen_ai-agent
 */
export const GEN_AI_AGENT_SPAN_NAME_FALLBACK = 'Generative AI agent operation';

/**
 * Fallback name for gen_ai model spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#gen_ai-inference
 */
export const GEN_AI_INFERENCE_SPAN_NAME_FALLBACK = 'Generative AI model operation';

/**
 * Fallback name for graphql spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#graphql-graphql
 */
export const GRAPHQL_SPAN_NAME_FALLBACK = 'GraphQL Operation';

/**
 * Fallback name for http.(client|server) spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#http
 */
export const HTTP_SPAN_NAME_FALLBACK = 'HTTP';

/**
 * Fallback name for messaging spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#messaging
 */
export const MESSAGING_SPAN_NAME_FALLBACK = 'Messaging';

/**
 * Fallback name for mcp server spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#mcp-server
 */
export const MCP_SERVER_SPAN_NAME_FALLBACK = 'MCP server operation';

/**
 * Fallback name for mcp notification spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#mcp-notification
 */
export const MCP_NOTIFICATION_SPAN_NAME_FALLBACK = 'MCP notification';

/**
 * Fallback name for resource spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#resource-resources
 */
export const RESOURCE_SPAN_NAME_FALLBACK = 'Resource';

/**
 * Fallback name for router spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#routing-router
 */
export const ROUTER_SPAN_NAME_FALLBACK = 'Router';

/**
 * Fallback name for request handler spans when no better-suited span name is available.
 * @see https://getsentry.github.io/sentry-conventions/names/#resource-resources
 */
export const REQUEST_HANDLER_SPAN_NAME_FALLBACK = 'Request Handler';
