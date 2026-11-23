import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    plugins: [
      reactRouter(),
      sentryReactRouter({ release: { name: 'react-router-8-framework-e2e' }, sourcemaps: { disable: true } }, config),
    ],
  };
});
