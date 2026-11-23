import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  const orchestrion = (globalThis as { __SENTRY_ORCHESTRION__?: { runtime?: string[] } }).__SENTRY_ORCHESTRION__;
  return { runtimeInjection: Array.isArray(orchestrion?.runtime) };
});
