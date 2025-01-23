import esbuild from 'esbuild';

console.log('Running build using esbuild version', esbuild.version);

const output = esbuild.buildSync({
  logLevel: 'debug',
  platform: 'node',
  entryPoints: ['./index.js'],
  outfile: './dist/esbuild/index.js',
  target: 'esnext',
  format: 'cjs',
  bundle: true,
  loader: { '.node': 'copy' },
});

process.exit(output.errors.length);
