/* eslint-disable no-console */
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { AstroConfig, AstroIntegration } from 'astro';
import * as fs from 'fs';
import * as path from 'path';

import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from './snippets';
import type { SentryOptions } from './types';

const PKG_NAME = '@sentry/astro';

export const sentryAstro = (options: SentryOptions = {}): AstroIntegration => {
  return {
    name: PKG_NAME,
    hooks: {
      // eslint-disable-next-line complexity
      'astro:config:setup': async ({ updateConfig, injectScript, config }) => {
        // The third param here enables loading of all env vars, regardless of prefix
        // see: https://main.vitejs.dev/config/#using-environment-variables-in-config

        // TODO: Ideally, we want to load the environment with vite like this:
        // const env = loadEnv('production', process.cwd(), '');
        // However, this currently throws a build error.
        // Will revisit this later.
        const env = process.env;

        const uploadOptions = options.sourceMapsUploadOptions || {};

        const shouldUploadSourcemaps = uploadOptions?.enabled ?? true;
        const authToken = uploadOptions.authToken || env.SENTRY_AUTH_TOKEN;

        if (shouldUploadSourcemaps && authToken) {
          updateConfig({
            vite: {
              build: {
                sourcemap: true,
              },
              plugins: [
                sentryVitePlugin({
                  org: uploadOptions.org ?? env.SENTRY_ORG,
                  project: uploadOptions.project ?? env.SENTRY_PROJECT,
                  authToken: uploadOptions.authToken ?? env.SENTRY_AUTH_TOKEN,
                  telemetry: uploadOptions.telemetry ?? true,
                  sourcemaps: {
                    assets: [getSourcemapsAssetsGlob(config)],
                  },
                  debug: options.debug ?? false,
                }),
              ],
            },
          });
        }

        const pathToClientInit = options.clientInitPath
          ? path.resolve(options.clientInitPath)
          : findDefaultSdkInitFile('client');
        const pathToServerInit = options.serverInitPath
          ? path.resolve(options.serverInitPath)
          : findDefaultSdkInitFile('server');

        if (pathToClientInit) {
          options.debug && console.log(`[sentry-astro] Using ${pathToClientInit} for client init.`);
          injectScript('page', buildSdkInitFileImportSnippet(pathToClientInit));
        } else {
          options.debug && console.log('[sentry-astro] Using default client init.');
          injectScript('page', buildClientSnippet(options || {}));
        }

        if (pathToServerInit) {
          options.debug && console.log(`[sentry-astro] Using ${pathToServerInit} for server init.`);
          injectScript('page-ssr', buildSdkInitFileImportSnippet(pathToServerInit));
        } else {
          options.debug && console.log('[sentry-astro] Using default server init.');
          injectScript('page-ssr', buildServerSnippet(options || {}));
        }
      },
    },
  };
};

function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const fileExtensions = ['ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs', 'mts'];
  return fileExtensions
    .map(ext => path.resolve(path.join(process.cwd(), `sentry.${type}.config.${ext}`)))
    .find(filename => fs.existsSync(filename));
}

function getSourcemapsAssetsGlob(config: AstroConfig): string {
  // outDir is stored as a `file://` URL
  const outDirPathname = config.outDir && config.outDir.pathname;
  const rootDirName = config.root && config.root.pathname;

  console.log({ outDirPathname, rootDirName });

  if (outDirPathname && rootDirName) {
    const relativePath = path.relative(rootDirName, outDirPathname);
    return `${relativePath}/**/*`;
  }

  // fallback to default output dir
  return 'dist/**/*';
}
