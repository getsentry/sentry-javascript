import esbuild from 'esbuild';

console.log('Running build using esbuild version', esbuild.version);

for (const [format, outfile] of [
  ['cjs', './dist/cjs/index.js'],
  ['esm', './dist/esm/index.mjs'],
]) {
  esbuild.buildSync({
    platform: 'node',
    entryPoints: ['./index.ts'],
    outfile,
    target: 'esnext',
    format,
    bundle: true,
    loader: { '.node': 'copy' },
    external: ['@sentry/node', '@sentry/profiling-node'],
  });
}
