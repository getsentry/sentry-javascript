import type { NextConfig } from 'next';

import { withSentryConfig } from '../../src/config/withSentryConfig';

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
