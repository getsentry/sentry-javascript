import type { Client } from './client';
import type { ClientOptions } from './options';
import type { Transport } from './transport';

/**
 * The internal sentry options that can be overriden by remote configuration.
 */
export type RemoteOverrideableConfig = Pick<ClientOptions, 'sampleRate' | 'tracesSampleRate'>;

export type RemoteConfigSource = 'DEFAULT' | 'CACHED' | 'REMOTE';

export interface RemoteConfigInterface {
  /**
   * Applies remote configuration updates to local configuration.
   *
   * Returns true if a new configuration was applied, false if active
   * configuration is unchanged.
   */
  applyUpdate: () => boolean;
  /**
   * Fetch configuration, but does *not* apply. Call `applyConfig` to use fetched configuration.
   */
  fetch: () => void;
  /**
   * Async function to fetch and apply configuration.
   */
  fetchAndApply: () => any;
  /**
   * Returns current configuration. Can be from user-supplied defaults, local
   * cache, or remote configuration.
   */
  get: <T>(defaultConfig: T) => T;
  /**
   * Returns Sentry-internal configuration options.
   */
  getInternal: (config: RemoteOverrideableConfig) => RemoteOverrideableConfig;

  /**
   * Returns the source type of the active configuration
   */
  getSource: () => RemoteConfigSource;
}

export interface RemoteConfigStorage {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
}

export interface RemoteConfigOptions {
  client: Client;
  storage: RemoteConfigStorage;
  defaultConfigName?: string;
}

interface RemoteConfigFeature {
  key: string;
  value: string | number | boolean;
}

export interface RemoteConfigPayload {
  features: RemoteConfigFeature[];
  options: RemoteConfigPayloadOptions;
  version: number;
}
export interface RemoteConfigPayloadOptions {
  sample_rate: RemoteOverrideableConfig['sampleRate'];
  traces_sample_rate: RemoteOverrideableConfig['tracesSampleRate'];
}
