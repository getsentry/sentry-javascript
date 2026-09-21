import { reactRouter } from '@react-router/dev/vite';
import sentry from '@sentry/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    plugins: [reactRouter(), sentry({ sourcemaps: { disable: true } }, config)],
  };
});
