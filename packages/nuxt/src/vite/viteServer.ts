import { addVitePlugin, createResolver } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { consoleSandbox } from '@sentry/core';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { Plugin } from 'vite';
import type { SentryNuxtModuleOptions } from '../common/types';
import { addRuntimeFlagsTemplate } from './utils';

const SERVER_ENTRY_ALIAS = '#server-entry';

/**
 * Sets up the server SDK on the Vite server (`server.builder: 'vite'`), which runs no Nitro. The
 * `ssr` build imports the Sentry server config at the top of the server entry, and orchestrion
 * instruments the dependencies in that build.
 */
export function setupViteServer(nuxt: Nuxt, serverConfigFile: string, moduleOptions: SentryNuxtModuleOptions): void {
  // `nuxt prepare` (often a `postinstall` script) only generates types, so it needs no plugins and no warnings.
  if (nuxt.options._prepare) {
    return;
  }

  warn(
    "Support for the Nuxt Vite server (`server.builder: 'vite'`) is experimental and can change in a minor release. The server SDK starts only in production builds that run on Node.js.",
  );
  warnOnDeprecatedInjectMode(moduleOptions);

  if (nuxt.options.dev) {
    return;
  }

  const configPath = createResolver(nuxt.options.rootDir).resolve(serverConfigFile);
  const importPaths = [addRuntimeFlagsTemplate().dst, configPath];
  let isConfigBundled = false;

  addVitePlugin(
    sentryServerEntryPlugin(importPaths, () => {
      isConfigBundled = true;
    }),
    { client: false },
  );

  if (moduleOptions.buildTimeInstrumentation !== false) {
    addVitePlugin({ ...sentryOrchestrionPlugin(), applyToEnvironment: isSsrEnvironment }, { client: false });
  }

  // The Vite server API is experimental. If Nuxt renames the alias or the environment, the plugin
  // silently matches nothing, so check the result once all environments are built.
  nuxt.hook('build:done', () => {
    if (!isConfigBundled) {
      warn(
        `Could not add the Sentry server config to the server build: no \`ssr\` module resolved from \`${SERVER_ENTRY_ALIAS}\`. The server SDK does not start. Load the config with \`node --import\` instead.`,
      );
    }
  });
}

/**
 * Prepends side-effect imports to the module behind `#server-entry`, the documented seam through
 * which every deploy target reaches the Nuxt renderer. The imports evaluate once, before the
 * server handles its first request.
 */
function sentryServerEntryPlugin(importPaths: string[], onBundled: () => void): Plugin {
  let serverEntryId: string | undefined;

  return {
    name: 'sentry-nuxt-server-entry',
    applyToEnvironment: isSsrEnvironment,
    async buildStart() {
      // The id is virtual and contains the build directory, which changes between builds.
      serverEntryId = (await this.resolve(SERVER_ENTRY_ALIAS))?.id;
    },
    transform: {
      order: 'pre',
      handler(code, id) {
        if (id !== serverEntryId) {
          return null;
        }

        onBundled();
        const imports = importPaths.map(path => `import ${JSON.stringify(path)};`).join('');
        return { code: `${imports}${code}`, map: null };
      },
    },
  };
}

// Deploy targets add their own server environments. The Cloudflare worker environment, for
// example, cannot run the Node SDK.
function isSsrEnvironment(environment: { name: string }): boolean {
  return environment.name === 'ssr';
}

function warnOnDeprecatedInjectMode(moduleOptions: SentryNuxtModuleOptions): void {
  // oxlint-disable-next-line typescript/no-deprecated -- supported until removal
  const injectMode = moduleOptions.autoInjectServerSentry;

  if (injectMode) {
    warn(
      `\`autoInjectServerSentry: '${injectMode}'\` is deprecated and has no effect on the Vite server. The Sentry server config is bundled into the server build. Remove the option.`,
    );
  }
}

function warn(message: string): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(`[Sentry] ${message}`);
  });
}
