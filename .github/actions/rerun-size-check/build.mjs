import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

await build({
  entryPoints: [fileURLToPath(new URL('./index.mjs', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/index.cjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  minify: true,
  legalComments: 'linked',
});
