import packageJson from './package.json' with { type: 'json' };
import modulePackage from 'module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, 'src');

const external = [
  ...Object.keys(packageJson.dependencies || {}),
  ...modulePackage.builtinModules,
  'webpack',
  'rollup',
  'vite',
];

export default {
  platform: 'node',
  input: [
    'src/babel-plugin/index.ts',
    'src/core/index.ts',
    'src/rollup/index.ts',
    'src/vite/index.ts',
    'src/esbuild/index.ts',
    'src/webpack/index.ts',
    'src/webpack/webpack5.ts',
    'src/webpack/component-annotation-transform.ts',
  ],
  external,
  output: [
    {
      dir: './dist/esm',
      format: 'esm',
      exports: 'named',
      sourcemap: true,
      entryFileNames: chunkInfo => {
        if (chunkInfo.facadeModuleId) {
          const rel = path.relative(srcDir, chunkInfo.facadeModuleId);
          return rel.replace(/\.ts$/, '.mjs');
        }
        return '[name].mjs';
      },
      chunkFileNames: '_chunks/[name]-[hash].mjs',
    },
    {
      dir: './dist/cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
      entryFileNames: chunkInfo => {
        if (chunkInfo.facadeModuleId) {
          const rel = path.relative(srcDir, chunkInfo.facadeModuleId);
          return rel.replace(/\.ts$/, '.js');
        }
        return '[name].js';
      },
      chunkFileNames: '_chunks/[name]-[hash].js',
    },
  ],
};
