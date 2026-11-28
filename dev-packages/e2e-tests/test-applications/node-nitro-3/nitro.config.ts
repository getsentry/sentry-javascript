import { fileURLToPath } from 'node:url';
import { sentryNitro } from '@sentry/node/nitro';
import { defineConfig } from 'nitro';

export default defineConfig({
  modules: [sentryNitro()],
  experimental: { tasks: true },
  // Nitro's default in-memory cache does not go through unstorage, which publishes the channels for cache spans.
  cache: { driver: 'kv' },
  routes: {
    '/api/flush': './server/api/flush.ts',
    '/api/test-cache': './server/api/test-cache.ts',
    '/api/test-error': './server/api/test-error.ts',
    '/api/test-error-400': './server/api/test-error-400.ts',
    '/api/test-param/:id': './server/api/test-param/[id].ts',
    '/api/test-static': './server/api/test-static.ts',
    '/api/test-task-error': './server/api/test-task-error.ts',
  },
  // Nitro resolves task handlers from where the build runs, unlike route handlers.
  tasks: { 'test-error': { handler: fileURLToPath(new URL('./server/tasks/test-error.ts', import.meta.url)) } },
  plugins: ['./server/plugins/plugin-init-error.ts'],
});
