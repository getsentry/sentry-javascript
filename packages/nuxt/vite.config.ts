import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/vitest.setup.ts'],
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
};
