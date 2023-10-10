/* eslint-disable no-console */
import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { AstroIntegration } from 'astro';
import * as fs from 'fs';
import * as path from 'path';
import { loadEnv } from 'vite';

import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from './snippets';
import type { SentryOptions } from './types';

const PKG_NAME = '@sentry/astro';

export const sentryAstro = (options: SentryOptions = {}): AstroIntegration => {
  return {
    name: PKG_NAME,
    hooks: {
      'astro:config:setup': async ({ updateConfig, injectScript }) => {
        // The third param here enables loading of all env vars, regardless of prefix
        // see: https://main.vitejs.dev/config/#using-environment-variables-in-config
        const env = loadEnv('production', process.cwd(), '');

        if (options.authToken ?? env.SENTRY_AUTH_TOKEN) {
          updateConfig({
            vite: {
              build: {
                sourcemap: true,
              },
              plugins: [
                sentryVitePlugin({
                  org: options.org ?? env.SENTRY_ORG,
                  project: options.project ?? env.SENTRY_PROJECT,
                  authToken: options.authToken ?? env.SENTRY_AUTH_TOKEN,
                  telemetry: options.telemetry,
                }),
              ],
            },
          });
        }

        const pathToClientInit = options.clientInitPath ?? findSdkInitFile('client');
        const pathToServerInit = options.serverInitPath ?? findSdkInitFile('server');

        if (pathToClientInit) {
          options.debug && console.log(`[sentry-astro] Using ${pathToClientInit} for client init.`);
          injectScript('page', buildSdkInitFileImportSnippet(pathToClientInit));
        } else {
          options.debug && console.log('[sentry-astro] Using default client init.');
          injectScript('page', buildClientSnippet(options || {}));
        }

        if (pathToServerInit) {
          options.debug && console.log(`[sentry-astro] Using ${pathToServerInit} for server init.`);
          // For whatever reason, we need to move one level up to import the server file correctly
          injectScript('page-ssr', buildSdkInitFileImportSnippet(path.join('..', pathToServerInit)));
        } else {
          options.debug && console.log('[sentry-astro] Using default server init.');
          injectScript('page-ssr', buildServerSnippet(options || {}));
        }
      },
    },
  };
};

function findSdkInitFile(type: 'server' | 'client'): string | undefined {
  const fileExtensions = ['ts', 'js', 'tsx', 'jsx', 'mjs', 'cjs', 'mts'];
  return fileExtensions
    .map(ext => path.join(process.cwd(), `sentry.${type}.config.${ext}`))
    .find(filename => fs.existsSync(filename));
}
