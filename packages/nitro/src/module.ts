import { debug } from '@sentry/core';
import { defineNitroModule } from 'nitropack/kit';
import type { NitroModule } from 'nitropack/types';
import type { SentryNitroModuleOptionsWithDefaults, SentryNitroOptions } from './common/types';
import { setupDatabaseInstrumentation } from './rollup/databaseConfig';
import { setupEntrypointInstrumentation } from './rollup/entrypointConfig';
import { setupMiddlewareInstrumentation } from './rollup/middlewareConfig';
import { setupStorageInstrumentation } from './rollup/storageConfig';
import { findDefaultSdkInitFile } from './utils';

export const createSentryNitroModule = (
  moduleOptions: SentryNitroOptions = {},
  serverConfigFile?: string,
): NitroModule => {
  const defaultModuleOptions: SentryNitroModuleOptionsWithDefaults = {
    ...moduleOptions,
    autoInjectServerSentry: moduleOptions.autoInjectServerSentry,
    experimental_entrypointWrappedFunctions: moduleOptions.experimental_entrypointWrappedFunctions || [
      'default',
      'handler',
      'server',
    ],
  };

  return defineNitroModule({
    name: '@sentry/nitro',
    setup(nitro) {
      const _serverConfigFile = serverConfigFile || findDefaultSdkInitFile('server');
      if (!_serverConfigFile) {
        debug.log('[Nitro] No server config file found. Skipping Nitro server instrumentation...');
        return;
      }

      setupEntrypointInstrumentation(nitro, _serverConfigFile, defaultModuleOptions);
      // setupSourceMaps(nitro, moduleOptions);
      setupMiddlewareInstrumentation(nitro);
      setupStorageInstrumentation(nitro);
      setupDatabaseInstrumentation(nitro);
    },
  });
};
