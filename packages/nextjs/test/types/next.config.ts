import { withSentryConfig } from '../../src/config';
import { NextConfig } from 'next';

const config: NextConfig = {
  hideSourceMaps: true,
  webpack: config => ({
    ...config,
    module: {
      ...config.module,
      rules: [...config.module.rules],
    },
  }),
};

module.exports = withSentryConfig(config, {
  validate: true,
});
