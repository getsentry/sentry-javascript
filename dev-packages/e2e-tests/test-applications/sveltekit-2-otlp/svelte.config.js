import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter(),
    // SvelteKit's native server-side tracing emits its spans through the global OpenTelemetry
    // tracer provider, which the app registers itself in `src/instrumentation.server.ts`.
    experimental: {
      instrumentation: {
        server: true,
      },
      tracing: {
        server: true,
      },
    },
  },
};

export default config;
