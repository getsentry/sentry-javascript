import { createAssetServer } from 'remix/assets';

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  allowFiles: ['app/routes.ts', 'app/**/public/**'],
  allowPackages: ['remix', '@sentry/remix'],
  minify: true,
  scripts: {
    define: { 'process.env.E2E_TEST_DSN': JSON.stringify(process.env.E2E_TEST_DSN) },
  },
  watch: false,
  scripts: {
    // No bundler means no build time env inlining, so `define` is the only way to get configuration
    // into a browser module. The asset server substitutes these when it compiles.
    define: {
      'process.env.E2E_TEST_DSN': JSON.stringify(process.env.E2E_TEST_DSN),
    },
  },
});

// Served modules keep their bare imports, so the document must render this entry's import map.
export const entry = await assets.getScriptEntry('app/actions/public/entry.ts');
