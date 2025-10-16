import { debug } from '@sentry/core';
import { defineNitroModule } from 'nitropack/kit';
import type { NitroModule } from 'nitropack/types';
import type { SentryNitroModuleOptionsWithDefaults, SentryNitroOptions } from './common/types';
import { setupDatabaseInstrumentation } from './rollup/databaseConfig';
import { setupEntrypointInstrumentation } from './rollup/entrypointConfig';
import { setupMiddlewareInstrumentation } from './rollup/middlewareConfig';
import { setupStorageInstrumentation } from './rollup/storageConfig';
import { findDefaultSdkInitFile } from './utils';

export const createSentryNitroModule = (moduleOptions: SentryNitroOptions = {}): NitroModule => {
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
      const serverConfigFile = findDefaultSdkInitFile('server');
      if (!serverConfigFile) {
        debug.log('[Sentry] No server config file found. Skipping Nitro server instrumentation...');
        return;
      }

      setupEntrypointInstrumentation(nitro, serverConfigFile, defaultModuleOptions);
      // setupSourceMaps(nitro, moduleOptions);
      setupMiddlewareInstrumentation(nitro);
      setupStorageInstrumentation(nitro);
      setupDatabaseInstrumentation(nitro);
    },
  });
};
