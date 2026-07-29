import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router';
import { defineConfig } from 'vite';


export default defineConfig(config => {
  return {
    plugins: [reactRouter(), sentryReactRouter({ sourcemaps: { disable: true } }, config)],
  };
});
