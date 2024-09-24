import {
  addInstrumentationFileToBuild,
  experimental_addInstrumentationFileTopLevelImportToServerEntry,
} from './addInstrumentation';
import type {
  Nitro,
  SentrySolidStartConfigOptions,
  SolidStartInlineConfig,
  SolidStartInlineConfigNitroHooks,
} from './types';

export const withSentry = (
  solidStartConfig: SolidStartInlineConfig = {},
  sentrySolidStartConfigOptions: SentrySolidStartConfigOptions = {},
): SolidStartInlineConfig => {
  const server = (solidStartConfig.server || {}) as SolidStartInlineConfigNitroHooks;
  const hooks = server.hooks || {};

  let serverDir: string;
  let buildPreset: string;

  return {
    ...solidStartConfig,
    server: {
      ...server,
      hooks: {
        ...hooks,
        async close() {
          if (sentrySolidStartConfigOptions.experimental_basicServerTracing) {
            await experimental_addInstrumentationFileTopLevelImportToServerEntry(serverDir, buildPreset);
          }

          // Run user provided hook
          if (hooks.close) {
            hooks.close();
          }
        },
        async 'rollup:before'(nitro: Nitro) {
          serverDir = nitro.options.output.serverDir;
          buildPreset = nitro.options.preset;

          await addInstrumentationFileToBuild(nitro);

          // Run user provided hook
          if (hooks['rollup:before']) {
            hooks['rollup:before'](nitro);
          }
        },
      },
    },
  };
};
