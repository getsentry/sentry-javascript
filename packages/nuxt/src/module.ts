import * as fs from 'fs';
import * as path from 'path';
import { type Resolver, addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit';
import { addImportStatement, buildSdkInitFileImportSnippet } from './common/snippets';
import type { SentryNuxtOptions } from './common/types';

export type ModuleOptions = SentryNuxtOptions;

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@sentry/nuxt/module',
    configKey: 'sentry',
    compatibility: {
      nuxt: '^3.0.0',
    },
  },
  defaults: {},
  setup(_moduleOptions, nuxt) {
    const resolver: Resolver = createResolver(import.meta.url);

    const pathToClientInit = findDefaultSdkInitFile('client');

    if (pathToClientInit) {
      nuxt.hook('app:templates', nuxtApp => {
        if (nuxtApp.rootComponent) {
          try {
            addImportStatement(nuxtApp.rootComponent, buildSdkInitFileImportSnippet(pathToClientInit));
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[Sentry] Could not add import statement to root component. ${err}`);
          }
        }
      });
    }

    if (resolver) {
      addPlugin(resolver.resolve('./runtime/plugins/sentry.client'));
    }
  },
});

function findDefaultSdkInitFile(type: /* 'server' | */ 'client'): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];

  const cwd = process.cwd();
  return possibleFileExtensions
    .map(e => path.resolve(path.join(cwd, `sentry.${type}.config.${e}`)))
    .find(filename => fs.existsSync(filename));
}
