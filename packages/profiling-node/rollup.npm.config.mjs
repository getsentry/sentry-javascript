import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { makeBaseNPMConfig } from '@sentry-internal/rollup-utils';

export default makeBaseNPMConfig({
  packageSpecificConfig: {
    input: 'src/index.ts',
    output: { file: 'lib/index.js', format: 'cjs', dir: undefined, preserveModules: false },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ]
  }
});
