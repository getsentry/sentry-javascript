import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
};
