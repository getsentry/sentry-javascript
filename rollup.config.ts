import { RollupOptions } from 'rollup';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';

import pkg from './package.json';

const config: RollupOptions = {
  input: 'src/index.ts',
  output: [
    {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
    },
    {
      file: pkg.module,
      format: 'esm',
    },
  ],
  external: [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ],
  plugins: [
    typescript(),
    replace({
      // __SENTRY_DEBUG__ should be save to replace in any case, so no checks for assignments necessary
      preventAssignment: false,
      values: {
        // @ts-expect-error not gonna deal with types here
        __SENTRY_DEBUG__: process.env.NODE_ENV === 'development',
      },
    }),
  ],
};

export default config;
