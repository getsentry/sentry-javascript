import * as fs from 'fs';
import * as path from 'path';
import { addPluginTemplate } from '@nuxt/kit';

/**
 * Returns the config file e.g. sentry.client.config.ts
 */
export function findDefaultSdkInitFile(type: 'server' | 'client'): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];

  const cwd = process.cwd();
  const filePath = possibleFileExtensions
    .map(e => path.resolve(path.join(cwd, `sentry.${type}.config.${e}`)))
    .find(filename => fs.existsSync(filename));

  return filePath ? path.basename(filePath) : undefined;
}

/**
 *  Injects a side effect import of the Sentry config file by adding a Nuxt plugin template.
 */
export function injectSentryConfigImport(moduleAlias: '#sentry-server-config' | '#sentry-client-config'): void {
  addPluginTemplate({
    // remove the # from the beginning of the alias
    filename: `${moduleAlias.slice(1)}.mjs`,
    getContents: () => `import "${moduleAlias}"\n` + 'export default defineNuxtPlugin(() => {})',
  });
}
