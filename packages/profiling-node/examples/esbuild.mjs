import esbuild from 'esbuild';
import path from 'path';

import { URL, fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

esbuild.build({
  platform: 'node',
  format: 'cjs',
  target: 'node12',
  entryPoints: [path.resolve(__dirname, './index.js')],
  outdir: path.resolve(__dirname, './dist/esbuild'),
  bundle: true,
  loader: {
    '.node': 'copy'
  },
  tsconfig: path.resolve(__dirname, '../tsconfig.json')
});
