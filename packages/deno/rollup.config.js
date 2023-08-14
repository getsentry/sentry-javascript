import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import sucrase from '@rollup/plugin-sucrase';

export default {
  input: ['src/index.ts'],
  output: {
    dir: 'build',
    sourcemap: true,
    preserveModules: false,
    strict: false,
    freeze: false,
    interop: 'auto',
    format: 'esm',
    banner: '/// <reference types="./index.d.ts" />',
  },
  plugins: [
    nodeResolve({
      extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
    }),
    replace({
      preventAssignment: true,
      values: {
        __DEBUG_BUILD__: false,
        __SENTRY_DEBUG__: false,
        __SENTRY_BROWSER_BUNDLE__: false,
        __SENTRY_SDK_SOURCE__: JSON.stringify('denoland'),
      },
    }),
    sucrase({
      transforms: ['typescript', 'jsx'],
    }),
  ],
};
