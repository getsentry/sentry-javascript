import { defineIntegration, getClient, remoteConfig } from '@sentry/core';
import type { IntegrationFn, RemoteConfigStorage, RemoteOverrideableConfig } from '@sentry/types';
import type { Client } from '@sentry/types';
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
    beforeAllSetup(client: Client) {
      // Happens before normal integrations are setup
      _inst = remoteConfig({ client, storage: browserStorage() });
      // @ts-expect-error demo
      client.remoteConfig = _inst;

      _inst.init();
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
    get<T>(key: string, defaultValue: T): T {
      if (!_inst) {
        return defaultValue;
      }

      return _inst.get(key, defaultValue);
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
      try {
        const value = WINDOW.localStorage.getItem(_getStorageKey(key));

        if (value === null) {
          return value;
        }

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
