import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { makeBaseNPMConfig, makeNPMConfigVariants, plugins } from '@sentry-internal/rollup-utils';

const configs = makeNPMConfigVariants(makeBaseNPMConfig());
const cjsConfig = configs.find(config => config.output.format === 'cjs');

if (!cjsConfig) {
  throw new Error('CJS config is required for profiling-node.');
}

const config = {
  ...cjsConfig,
  input: 'src/index.ts',
  output: { ...cjsConfig.output, file: 'lib/index.js', format: 'cjs', dir: undefined, preserveModules: false },
  plugins: [plugins.makeLicensePlugin('Sentry Node Profiling'), resolve(), commonjs(), typescript({ tsconfig: './tsconfig.json' })],
};

export default config;
