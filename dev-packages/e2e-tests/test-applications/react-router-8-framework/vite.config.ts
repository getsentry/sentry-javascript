import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig(config => {
  return {
    define: {
      __E2E_TEST_TUNNEL__: JSON.stringify(!!process.env.E2E_TEST_TUNNEL),
    },
    plugins: [reactRouter(), sentryReactRouter({ sourcemaps: { disable: true } }, config)],
  };
});
