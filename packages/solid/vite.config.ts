import solidPlugin from 'vite-plugin-solid';
import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  plugins: [solidPlugin({ hot: !process.env.VITEST })],
  test: {
    ...baseConfig.test,
  },
};
