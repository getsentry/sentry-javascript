import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig({
  // The `as PluginOption` cast fixes an overload error from two Vite
  // versions resolving in the workspace (root vs vitest's nested copy); the plugin
  // options object is still type-checked at the call site.
  plugins: [cloudflare(), sentryCloudflareVitePlugin() as PluginOption],
});
