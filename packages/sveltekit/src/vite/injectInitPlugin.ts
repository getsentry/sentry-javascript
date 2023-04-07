import { logger } from '@sentry/utils';
import MagicString from 'magic-string';
import * as path from 'path';
import type { Plugin, TransformResult } from 'vite';

import { getUserConfigFile } from './utils';

const serverIndexFilePath = path.join('@sveltejs', 'kit', 'src', 'runtime', 'server', 'index.js');
const devClientAppFilePath = path.join('generated', 'client', 'app.js');
const prodClientAppFilePath = path.join('generated', 'client-optimized', 'app.js');

/**
 * This plugin injects the `Sentry.init` calls from `sentry.(client|server).config.(ts|js)`
 * into SvelteKit runtime files.
 */
export const injectSentryInitPlugin: Plugin = {
  name: 'sentry-init-injection-plugin',

  // In this hook, we inject the `Sentry.init` calls from `sentry.(client|server).config.(ts|js)`
  // into SvelteKit runtime files: For the server, we inject it into the server's `index.js`
  // file. For the client, we use the `_app.js` file.
  transform(code, id) {
    if (id.endsWith(serverIndexFilePath)) {
      logger.debug('Injecting Server Sentry.init into', id);
      return addSentryConfigFileImport('server', code, id) || code;
    }

    if (id.endsWith(devClientAppFilePath) || id.endsWith(prodClientAppFilePath)) {
      logger.debug('Injecting Client Sentry.init into', id);
      return addSentryConfigFileImport('client', code, id) || code;
    }

    return code;
  },

  // This plugin should run as early as possible,
  // setting `enforce: 'pre'` ensures that it runs before the built-in vite plugins.
  // see: https://vitejs.dev/guide/api-plugin.html#plugin-ordering
  enforce: 'pre',
};

function addSentryConfigFileImport(
  platform: 'server' | 'client',
  originalCode: string,
  entryFileId: string,
): TransformResult | undefined {
  const projectRoot = process.cwd();
  const sentryConfigFilename = getUserConfigFile(projectRoot, platform);

  if (!sentryConfigFilename) {
    logger.error(`Could not find sentry.${platform}.config.(ts|js) file.`);
    return undefined;
  }

  const filePath = path.join(path.relative(path.dirname(entryFileId), projectRoot), sentryConfigFilename);
  const importStmt = `\nimport "${filePath}";`;

  const ms = new MagicString(originalCode);
  ms.append(importStmt);

  return { code: ms.toString(), map: ms.generateMap() };
}
