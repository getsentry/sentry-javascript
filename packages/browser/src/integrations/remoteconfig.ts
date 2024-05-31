import { defineIntegration, getClient, remoteConfig } from '@sentry/core';
import type { IntegrationFn, RemoteConfigStorage, RemoteOverrideableConfig } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

const INTEGRATION_NAME = 'RemoteConfig';

/**
 * Remote Configuration fetches configuration from a remote server.
 */
const _remoteConfigIntegration = (() => {
  let _inst: ReturnType<typeof remoteConfig> | undefined;
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const client = getClient();
      if (!client) {
        // when can this happen?
        return;
      }
      _inst = remoteConfig({ client, storage: browserStorage() });
    },
    get api() {
      return _inst;
    },
    applyUpdate() {
      if (!_inst) {
        return;
      }

      return _inst.applyUpdate();
    },
    fetch() {
      if (!_inst) {
        return;
      }

      return _inst.fetch();
    },
    fetchAndApply() {
      if (!_inst) {
        return;
      }

      return _inst.fetchAndApply();
    },
    get<T>(defaultConfig: T): T {
      if (!_inst) {
        return defaultConfig;
      }

      return _inst.get(defaultConfig);
    },
    getInternal(config: RemoteOverrideableConfig): RemoteOverrideableConfig {
      if (!_inst) {
        return config;
      }

      return _inst.getInternal(config);
    },
    getSource() {
      if (!_inst) {
        return 'DEFAULT';
      }

      return _inst.getSource();
    },
  };
}) satisfies IntegrationFn;

export const remoteConfigIntegration = defineIntegration(_remoteConfigIntegration);

function _getStorageKey(key: string): string {
  return `_sentryRC:${key}`;
}

function browserStorage(): RemoteConfigStorage {
  return {
    get(key: string): unknown {
      const value = WINDOW.localStorage.getItem(_getStorageKey(key));

      if (value === null) {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    },
    set(key: string, value: any): void {
      try {
        WINDOW.localStorage.setItem(_getStorageKey(key), JSON.stringify(value));
      } catch {
        DEBUG_BUILD && logger.error('Unable to serialize configuration and save to localStorage');
      }
    },
  };
}
