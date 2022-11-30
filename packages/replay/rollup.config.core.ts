import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

import pkg from './package.json';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const config = defineConfig({
  input: './src/index.ts',
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
  external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
    replace({
      // __SENTRY_DEBUG__ should be save to replace in any case, so no checks for assignments necessary
      preventAssignment: false,
      values: {
        __SENTRY_REPLAY_VERSION__: JSON.stringify(pkg.version),
        // @ts-ignore not gonna deal with types here
        __SENTRY_DEBUG__: !IS_PRODUCTION,
        // @ts-ignore __DEBUG_BUILD__ variable isn't yet replaced correctly at build time so
        // we need to set this as true.
        __DEBUG_BUILD__: true,
      },
    }),
  ],
});

export default config;
