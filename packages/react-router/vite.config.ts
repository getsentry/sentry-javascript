import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'jsdom',
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
};
