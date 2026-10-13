import { defineIntegration } from '@sentry/core';

/**
 * Shim for the edge build so named imports from `@sentry/nextjs` stay resolvable in
 * edge-compiled instrumentation modules. The real implementation ships in the server build;
 * Vercel AI is not instrumented on the edge runtime.
 */
export const vercelAIIntegration = defineIntegration(() => {
  return {
    name: 'VercelAI',
  };
});
