import { debug } from '@sentry/core';
import type { NitroModule } from 'nitropack/types';
import type { SentryNitroModuleOptionsWithDefaults, SentryNitroOptions } from './common/types';
import { setupDatabaseInstrumentation } from './setup/setupDatabase';
import { setupEntrypointInstrumentation } from './setup/setupEntrypoint';
import { setupMiddlewareInstrumentation } from './setup/setupMiddlewares';
import { setupSourceMaps } from './setup/setupSourceMaps';
import { setupStorageInstrumentation } from './setup/setupStorage';
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

  return {
    name: '@sentry/nitro',
    setup(nitro) {
      const _serverConfigFile = serverConfigFile || findDefaultSdkInitFile('server');
      if (!_serverConfigFile) {
        debug.log('[Nitro] No server config file found. Skipping Nitro server instrumentation...');
        return;
      }

      setupSourceMaps(nitro, moduleOptions);
      setupEntrypointInstrumentation(nitro, _serverConfigFile, defaultModuleOptions);
      setupMiddlewareInstrumentation(nitro);
      setupStorageInstrumentation(nitro);
      setupDatabaseInstrumentation(nitro);
    },
  } satisfies NitroModule;
};
