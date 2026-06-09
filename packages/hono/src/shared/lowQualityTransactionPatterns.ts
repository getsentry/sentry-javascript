/**
 * Patterns for low-quality transactions that should be filtered out.
 * Covers e.g. browser noise (favicon) and Vite dev-server artifacts (`@hono/vite-dev-server`).
 */
export const LOW_QUALITY_TRANSACTION_PATTERNS: (string | RegExp)[] = [
  /\/node_modules\//,
  /\/favicon\.ico/,
  /\/@id\//,
  /\/@fs\//,
  /\/@vite\//,
];
