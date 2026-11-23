import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Prerendering and the SPA shell render pages at build time, which must carry the release as well.
    tanstackStart({ prerender: { enabled: true }, pages: [{ path: '/prerendered' }], spa: { enabled: true } }),
    nitro(),
    viteReact(),
    sentryTanstackStart({
      sentryUrl: 'http://localhost:3032',
      authToken: 'fake-auth-token',
      org: 'test-org',
      project: 'test-project',
      release: { name: 'test-release' },
      debug: true,
    }),
  ],
});
