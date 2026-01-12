import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      include: ['src/utils/ring-buffer.ts', 'src/telemetry-processor/telemetry-buffer.ts'],
    }
  },
};
