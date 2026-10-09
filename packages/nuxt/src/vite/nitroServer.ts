import { addNitroPlugin, createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import type { Nitro } from 'nitropack/types';
import type { SentryNuxtModuleOptions } from '../common/types';
import {
  addDynamicImportEntryFileWrapper,
  addSentryTopImport,
  addServerConfigPlugin,
  addServerConfigShimWithWarning,
  addServerConfigToBuild,
} from './addServerConfig';
import { addDatabaseInstrumentation } from './databaseConfig';
import { addMiddlewareImports, addMiddlewareInstrumentation } from './middlewareConfig';
import { addStorageInstrumentation } from './storageConfig';
import type { ServerApi } from './utils';

type NitroModuleOptions = Omit<SentryNuxtModuleOptions, 'experimental_entrypointWrappedFunctions'> &
  Required<Pick<SentryNuxtModuleOptions, 'experimental_entrypointWrappedFunctions'>>;

/**
 * Sets up the server SDK on the Nitro side: the server config plugin, the server plugins, and the
 * middleware, storage and database instrumentation.
 *
 * A host on the `nuxt` server API runs no Nitro, so it gets none of this. Kit would skip each
 * Nitro-only registration there with a `NUXT_B8024` warning.
 */
export function setupNitroServer(
  nuxt: Nuxt,
  serverApi: ServerApi,
  serverConfigFile: string,
  moduleOptions: NitroModuleOptions,
): void {
  if (serverApi === 'nuxt') {
    return;
  }

  const isNitroV3 = serverApi === 'nitro3';
  const moduleDirResolver = createResolver(import.meta.url);
  // oxlint-disable-next-line typescript/no-deprecated -- supported until removal
  const injectMode = moduleOptions.autoInjectServerSentry;
  // The deprecated inject modes replace the default in-bundle initialization until their removal
  const deprecatedInjectMode =
    injectMode === 'top-level-import' || injectMode === 'experimental_dynamic-import' ? injectMode : undefined;

  if (!deprecatedInjectMode) {
    addServerConfigPlugin(nuxt, serverConfigFile, !isNitroV3);
  }

  if (isNitroV3) {
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/handler.server'));
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/update-route-name.server'));
  } else {
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/handler-legacy.server'));
    addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/update-route-name-legacy.server'));
  }

  addNitroPlugin(moduleDirResolver.resolve('./runtime/plugins/sentry.server'));

  // Preps the middleware instrumentation module.
  addMiddlewareImports();
  addStorageInstrumentation(nuxt, !isNitroV3);
  addDatabaseInstrumentation(nuxt.options.nitro, !isNitroV3, moduleOptions);

  nuxt.hooks.hook('nitro:init', nitro => {
    if (nuxt.options?._prepare) {
      return;
    }

    addMiddlewareInstrumentation(nitro, isNitroV3);

    if (deprecatedInjectMode) {
      setupDeprecatedInjectMode(nitro, deprecatedInjectMode, isNitroV3, serverConfigFile, moduleOptions);
      return;
    }

    addServerConfigShimWithWarning(nitro);

    if (moduleOptions.debug) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          `[Sentry] Bundled \`${serverConfigFile}\` into the Nitro server build. The SDK initializes itself at server startup — no \`node --import\` preload needed.`,
        );
      });
    }
  });
}

function setupDeprecatedInjectMode(
  nitro: Nitro,
  injectMode: 'top-level-import' | 'experimental_dynamic-import',
  isNitroV3: boolean,
  serverConfigFile: string,
  moduleOptions: NitroModuleOptions,
): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] \`autoInjectServerSentry: '${injectMode}'\` is deprecated and will be removed in a future major version. The Sentry server config is bundled into the Nitro server build by default now. Remove the option to use the default behavior.`,
    );
  });

  if (injectMode === 'top-level-import') {
    // Nitro 3 (in Nuxt 5) is not bundled in dev mode, so there is no build to emit into.
    if (!(isNitroV3 && nitro.options.dev)) {
      addServerConfigToBuild(moduleOptions, nitro, serverConfigFile);
    }
    addSentryTopImport(moduleOptions, nitro);
  }

  if (injectMode === 'experimental_dynamic-import') {
    addDynamicImportEntryFileWrapper(nitro, serverConfigFile, moduleOptions);

    if (moduleOptions.debug) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.log(
          '[Sentry] Wrapping the server entry file with a dynamic `import()`, so Sentry can be preloaded before the server initializes.',
        );
      });
    }
  }
}
