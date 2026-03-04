import { defineConfig } from 'vite';
import vinext from 'vinext';
import { sentryVinext } from '@sentry/vinext/vite';

export default defineConfig({
  plugins: [vinext(), sentryVinext()],
});
