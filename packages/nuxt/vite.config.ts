import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.ts'],
  },
};
