import type { NextConfig } from 'next';

import { withSentryConfig } from '../../src/config/withSentryConfig';

const config: NextConfig = {
  webpack: config => ({
    ...config,
    module: {
      ...config.module,
      rules: [...config.module.rules],
    },
  }),
};

module.exports = withSentryConfig(config);
