import type {
  RemoteOverrideableConfig,
  RemoteConfigOptions,
  RemoteConfigPayload,
  RemoteConfigInterface,
  RemoteConfigSource,
  Transport,
  RemoteConfigPayloadOptions,
} from '@sentry/types';
import { getRemoteConfigEndpoint } from './api';

const DEFAULT_CONFIG_NAME = '__default';

// type RemoteConfigState = 'INITIALIZING' | 'INITIALIZED';

export interface RemoteConfigActive {
  features: Record<string, any>;
  options: RemoteConfigPayloadOptions;
  version: number;
}

/**
 *
 */
export function remoteConfig({
  client,
  defaultConfigName = DEFAULT_CONFIG_NAME,
  storage,
}: RemoteConfigOptions): RemoteConfigInterface {
  let _activeConfig: RemoteConfigActive | undefined;
  let _pendingConfig: RemoteConfigPayload | undefined;
  // let _lastFetch: Date | undefined;
  let _lastUpdate: Date | undefined;
  let _source: RemoteConfigSource = 'DEFAULT';
  let _hasUpdate: boolean = false;
  // let _state: RemoteConfigState = 'INITIALIZING';
  let _transport: Transport | undefined;

  /**
   *
   */
  function _initConfig(): void {
    // Use cached configuration if it exists
    const cachedValue = storage.get(defaultConfigName);
    if (cachedValue) {
      _loadConfig(cachedValue);
      _source = 'CACHED';
      // _state = 'INITIALIZED';
    }

    fetch();
  }

  function _initTransport(): void {
    const clientOptions = client.getOptions();
    const dsn = client.getDsn();

    if (!dsn) {
      return;
    }

    _transport = clientOptions.transport({
      tunnel: clientOptions.tunnel,
      recordDroppedEvent: client.recordDroppedEvent.bind(client),
      ...clientOptions.transportOptions,
      url: getRemoteConfigEndpoint(
        dsn,
        clientOptions.tunnel,
        clientOptions._metadata ? clientOptions._metadata.sdk : undefined,
      ),
      method: 'GET',
    });
  }

  /**
   * Initialize remote config integration
   */
  function _initialize(): void {
    _initTransport();
    _initConfig();
  }

  /**
   * Checks if the current cached configuration is expired
   */
  // function _checkCacheExpired() {
  //   const lastFetched = storage.get(`${defaultConfigName}_lastFetch`);
  // }

  /**
   * Loads a fetched/cached config so that it is usable by public APIs
   */
  function _loadConfig(config: RemoteConfigPayload): void {
    _activeConfig = {
      features: config.features.reduce<Record<string, any>>((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {}),
      options: config.options,
      version: config.version,
    };
  }

  /**
   *
   */
  function _fetch(): PromiseLike<void> {
    return new Promise((resolve, reject) => {
      if (!_transport) {
        return resolve();
      }

      // TODO
      return (
        _transport
          // @ts-expect-error envelopes and such
          .send([[], [[{ type: 'features' }, {}]]])
          .then(resp => {
            // _lastFetch = new Date();
            // on success, check if cached, then do nothing
            if (resp.statusCode === 304) {
              // _state = "SUCCESS_CACHED";

              return;
            }

            // not cached...get body and send pending
            // @ts-expect-error resp.response not typed
            resp.response
              .json()
              .then((data: RemoteConfigPayload) => {
                // _lastFetch = new Date();
                _pendingConfig = data;
                _hasUpdate = true;

                storage.set(defaultConfigName, data);
                // storage.set(`${defaultConfigName}_lastFetch`, +_lastFetch);
                // _state = "SUCCESS";
                resolve();
              })
              .catch(() => {
                // TODO: Error handling
              });
          })
      );
    });
  }

  /**
   * Applies remote configuration updates to local configuration.
   */
  function applyUpdate(): boolean {
    if (!_pendingConfig || !_hasUpdate) {
      // Nothing to do;
      return false;
    }

    _loadConfig(_pendingConfig);
    _pendingConfig = undefined;
    _source = 'REMOTE';
    _lastUpdate = new Date();

    return true;
  }

  /**
   * Async function to fetch and apply configuration.
   */
  async function fetchAndApply(): Promise<void> {
    await _fetch();
    applyUpdate();
  }

  /**
   * Fetch configuration, but does *not* apply. Call `applyConfig` to use fetched configuration.
   */
  function fetch(): void {
    void _fetch();
  }

  /**
   *
   */
  function getSource(): 'DEFAULT' | 'CACHED' | 'REMOTE' {
    return _source;
  }

  /** @inheritDoc */
  function getInternal(config: RemoteOverrideableConfig): RemoteOverrideableConfig {
    return {
      sampleRate: (_activeConfig && _activeConfig.options.sample_rate) || config.sampleRate,
      tracesSampleRate: (_activeConfig && _activeConfig.options.traces_sample_rate) || config.tracesSampleRate,
    };
  }

  /** @inheritdoc */
  function get<T>(defaultConfig: T): T {
    return (_activeConfig && (_activeConfig.features as T)) || defaultConfig;
  }

  _initialize();

  return {
    applyUpdate,
    fetch,
    fetchAndApply,
    get,
    getInternal,
    getSource,
  };
}
