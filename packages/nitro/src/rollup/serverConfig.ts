import { existsSync, readFile, writeFile } from 'node:fs';
import { debug } from '@sentry/core';
import type { Nitro } from 'nitropack/types';
import type { InputPluginOption } from 'rollup';
import type { SentryNitroOptions } from '../common/types';
import { createResolver, getFilenameFromNodeStartCommand } from '../utils';

const SERVER_CONFIG_FILENAME = 'sentry.server.config';

/**
 *  Adds the `sentry.server.config.ts` file as `sentry.server.config.mjs` to the `.output` directory to be able to reference this file in the node --import option.
 *
 *  By adding a Rollup plugin to the Nitro Rollup options, the Sentry server config is transpiled and emitted to the server build.
 */
export function addServerConfigToBuild(
  nitro: Nitro,
  moduleOptions: SentryNitroOptions,
  serverConfigFile: string,
): void {
  nitro.hooks.hook('rollup:before', (nitro, rollupConfig) => {
    if (rollupConfig?.plugins === null || rollupConfig?.plugins === undefined) {
      rollupConfig.plugins = [];
    } else if (!Array.isArray(rollupConfig.plugins)) {
      // `rollupConfig.plugins` can be a single plugin, so we want to put it into an array so that we can push our own plugin
      rollupConfig.plugins = [rollupConfig.plugins];
    }

    rollupConfig.plugins.push(injectServerConfigPlugin(nitro, serverConfigFile, moduleOptions.debug));
  });
}

/**
 *  Adds the Sentry server config import at the top of the server entry file to load the SDK on the server.
 *  This is necessary for environments where modifying the node option `--import` is not possible.
 *  However, only limited tracing instrumentation is supported when doing this.
 */
export function addSentryTopImport(moduleOptions: SentryNitroOptions, nitro: Nitro): void {
  nitro.hooks.hook('close', async () => {
    const fileNameFromCommand =
      nitro.options.commands.preview && getFilenameFromNodeStartCommand(nitro.options.commands.preview);

    // other presets ('node-server' or 'vercel') have an index.mjs
    const presetsWithServerFile = ['netlify'];

    const entryFileName = fileNameFromCommand
      ? fileNameFromCommand
      : typeof nitro.options.rollupConfig?.output.entryFileNames === 'string'
        ? nitro.options.rollupConfig?.output.entryFileNames
        : presetsWithServerFile.includes(nitro.options.preset)
          ? 'server.mjs'
          : 'index.mjs';

    const serverDirResolver = createResolver(nitro.options.output.serverDir);
    const entryFilePath = serverDirResolver.resolve(entryFileName);

    try {
      readFile(entryFilePath, 'utf8', (err, data) => {
        const updatedContent = `import './${SERVER_CONFIG_FILENAME}.mjs';\n${data}`;

        writeFile(entryFilePath, updatedContent, 'utf8', () => {
          if (moduleOptions.debug) {
            // eslint-disable-next-line no-console
            console.log(
              `[Sentry] Successfully added the Sentry import to the server entry file "\`${entryFilePath}\`"`,
            );
          }
        });
      });
    } catch (err) {
      if (moduleOptions.debug) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Sentry] An error occurred when trying to add the Sentry import to the server entry file "\`${entryFilePath}\`":`,
          err,
        );
      }
    }
  });
}

/**
 * Rollup plugin to include the Sentry server configuration file to the server build output.
 */
function injectServerConfigPlugin(nitro: Nitro, serverConfigFile: string, isDebug?: boolean): InputPluginOption {
  const filePrefix = '\0virtual:sentry-server-config:';

  return {
    name: 'rollup-plugin-inject-sentry-server-config',

    buildStart() {
      const configPath = createResolver(nitro.options.srcDir).resolve(`/${serverConfigFile}`);

      if (!existsSync(configPath)) {
        if (isDebug) {
          debug.log(`[Sentry] Sentry server config file not found: ${configPath}`);
        }
        return;
      }

      // Emitting a file adds it to the build output (Rollup is aware of the file, and we can later return the code in resolveId)
      this.emitFile({
        type: 'chunk',
        id: `${filePrefix}${serverConfigFile}`,
        fileName: `${SERVER_CONFIG_FILENAME}.mjs`,
      });
    },

    resolveId(source) {
      if (source.startsWith(filePrefix)) {
        const originalFilePath = source.replace(filePrefix, '');
        const configPath = createResolver(nitro.options.rootDir).resolve(`/${originalFilePath}`);

        return { id: configPath };
      }
      return null;
    },
  };
}
