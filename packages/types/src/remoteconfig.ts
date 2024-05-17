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

// export interface ConfigMetadata {
//   type: ConfigType;
//   source: Source;
// }
// interface ConfigObject<T = any> {
//   meta: ConfigMetadata;
//   value: T;
// }

export interface RemoteConfigStorage {
  get: (key: string) => any;
  set: (key: string, value: any) => void;
}

export interface RemoteConfigOptions {
  storage: RemoteConfigStorage;
  transport: Transport;
  defaultConfigName?: string;
}

export interface RemoteConfigPayload {
  options: RemoteConfigPayloadOptions;
  version: number;
}
export interface RemoteConfigPayloadOptions {
  sample_rate: RemoteOverrideableConfig['sampleRate'];
  traces_sample_rate: RemoteOverrideableConfig['tracesSampleRate'];
  // XXX: This is temporary, ideally we can return `_activeConfig.options ||
  // config`, but we are special casing `options.user_config` for UI
  // iteration speed.
  user_config: Record<string, any>;
}
