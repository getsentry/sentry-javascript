import { createAssetServer } from 'remix/assets';

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir: process.cwd(),
  allowFiles: ['app/routes.ts', 'app/**/public/**'],
  allowPackages: ['remix', '@sentry/remix'],
  minify: true,
  watch: false,
});

const entry = 'app/actions/public/entry.ts';

export const entryHref = await assets.getHref(entry);
export const entryPreloads = await assets.getPreloads(entry);
