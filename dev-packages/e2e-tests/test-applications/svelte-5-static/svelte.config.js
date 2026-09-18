import { withSentryConfig } from '@sentry/svelte';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),
};

const configWithSentry = withSentryConfig(config, {
  componentTracking: { trackComponents: true, trackInit: true },
});

export default configWithSentry;
