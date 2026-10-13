import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cloudflare(), sentryCloudflareVitePlugin()],
  // Builds every Vite environment, as `vite build --app` does.
  builder: {
    async buildApp(builder) {
      for (const environment of Object.values(builder.environments)) {
        await builder.build(environment);
      }
    },
  },
});
