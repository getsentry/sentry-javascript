import type {
  RemoteOverrideableConfig,
  RemoteConfigOptions,
  RemoteConfigPayload,
  RemoteConfigInterface,
  RemoteConfigSource,
} from '@sentry/types';

const DEFAULT_CONFIG_NAME = '__default';

/**
 * Remote Configuration fetches configuration from a remote server.
 */
export function remoteConfig({
  defaultConfigName = DEFAULT_CONFIG_NAME,
  storage,
  transport,
}: RemoteConfigOptions): RemoteConfigInterface {
  let _activeConfig: RemoteConfigPayload | undefined;
  let _pendingConfig: RemoteConfigPayload | undefined;
  let _lastFetch: Date | undefined;
  let _lastUpdate: Date | undefined;
  let _source: RemoteConfigSource = 'DEFAULT';
  let _hasUpdate: boolean = false;
  let _state: RemoteConfigState = 'INITIALIZING';

  console.log('remoteConfig!!');

  function _initConfig() {
    // Use cached configuration if it exists
    const cachedValue = storage.get(defaultConfigName);
    if (cachedValue) {
      _activeConfig = JSON.parse(cachedValue);
      _source = 'CACHED';
      _state = 'INITIALIZED';
    }
  }

  /**
   * Checks if the current cached configuration is expired
   */
  function _checkCacheExpired() {
    const lastFetched = storage.get(`${defaultConfigName}_lastFetch`);
  }

  _initConfig();

  function _fetch(): Promise<void> {
    return new Promise((resolve, reject) => {
      // TODO
      transport
        // @ts-expect-error envelopes and such
        .send([[], [[{ type: 'features' }, {}]]])
        .then(resp => {
          _lastFetch = new Date();
          // on success, check if cached, then do nothing
          if (resp.statusCode === 304) {
            // _state = "SUCCESS_CACHED";

            return;
          }

          // not cached...get body and send pending
          // @ts-expect-error resp.response not typed
          resp.response.json().then((data: RemoteConfigPayload) => {
            _lastFetch = new Date();
            _pendingConfig = data;
            _hasUpdate = true;

            storage.set(defaultConfigName, JSON.stringify(data));
            storage.set(`${defaultConfigName}_lastFetch`, +_lastFetch);
            // _state = "SUCCESS";
            resolve();
          });
        });
      // .catch((err: unknown) => {
      //   // TODO handle error
      //   // set fetch state to error
      //
      //   // _state = "ERROR";
      //   _lastFetch = new Date();
      //   reject(err);
      // });
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

    _activeConfig = _pendingConfig;
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

  function getSource(): 'DEFAULT' | 'CACHED' | 'REMOTE' {
    return _source;
  }

  /** @inheritDoc */
  function getInternal(config: RemoteOverrideableConfig): RemoteOverrideableConfig {
    // XXX: This is temporary, ideally we can return `_activeConfig.options ||
    // config`, but we are special casing `options.user_config` for UI
    // iteration speed.
    return {
      sampleRate: (_activeConfig && _activeConfig.options.sample_rate) || config.sampleRate,
      tracesSampleRate: (_activeConfig && _activeConfig.options.traces_sample_rate) || config.tracesSampleRate,
    };
  }

  /** @inheritdoc */
  function get<T>(defaultConfig: T): T {
    return (_activeConfig && (_activeConfig.options.user_config as T)) || defaultConfig;
  }

  return {
    applyUpdate,
    fetch,
    fetchAndApply,
    get,
    getInternal,
    getSource,
  };
}
