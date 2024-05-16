import type {
  RemoteOverrideableConfig,
  RemoteConfigOptions,
  RemoteConfigPayload,
  RemoteConfigPayloadOptions,
  RemoteConfigInterface,
  RemoteConfigSource,
} from '@sentry/types';

const DEFAULT_CONFIG_NAME = '__default';
const INTERNAL_OPTIONS_NAME = '__internal';

// function createConfig(name: string, value: any, storage: RemoteConfigStorage) {
//   let _activeConfig: any;
//   let _pendingConfig: any;
//   let _lastFetch: Date | null;
//   let _lastUpdate: Date | null;
//   const cachedValue = storage.get(name);
//   const _source = cachedValue ? Source.CACHE : Source.DEFAULT;
//
//   return {};
// }

/**
 * Remote Configuration is an integration that fetches configuration from a remote server.
 */
export function remoteConfig({
  defaultConfigName = DEFAULT_CONFIG_NAME,
  storage,
  transport,
}: RemoteConfigOptions): RemoteConfigInterface {
  const _defaultConfigName = defaultConfigName;
  let _activeConfig: RemoteConfigPayload | undefined;
  let _pendingConfig: RemoteConfigPayload | undefined;
  let _lastFetch: Date | undefined;
  let _lastUpdate: Date | undefined;
  let _source: RemoteConfigSource = 'DEFAULT';
  let _hasUpdate: boolean = false;

  function initConfig() {
    const cachedValue = storage.get(_defaultConfigName);
    if (cachedValue) {
      _activeConfig = cachedValue;
      _source = 'CACHED';
    }
  }

  initConfig();

  function _internalFetch(): Promise<void> {
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
            _pendingConfig = data;
            _hasUpdate = true;
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
    try {
      // transport send
      // const data = response.json();
      // if (data && data.options) {
      //   const { user_options: userOptions, ...internalOptions } = data.options;
      //
      //   _pendingConfig.set(_defaultConfigName, userOptions);
      //   _pendingConfig.set(INTERNAL_OPTIONS_NAME, internalOptions);
      // }
      // _hasUpdate = true;
    } catch (err) {
      // handle error
      //
    } finally {
      _lastFetch = new Date();
    }
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
    await _internalFetch();
    applyUpdate();
  }

  /**
   * Fetch configuration, but does *not* apply. Call `applyConfig` to use fetched configuration.
   */
  function fetch(): void {
    void _internalFetch();
  }

  function getSource(): 'DEFAULT' | 'CACHED' | 'REMOTE' {
    return _source;
  }

  function getInternal(config: RemoteOverrideableConfig): RemoteOverrideableConfig {
    // XXX: This is temporary, ideally we can return `_activeConfig.options ||
    // config`, but we are special casing `options.user_config` for UI
    // iteration speed.
    return {
      sampleRate: (_activeConfig && _activeConfig.options.sample_rate) || config.sampleRate,
      tracesSampleRate: (_activeConfig && _activeConfig.options.traces_sample_rate) || config.tracesSampleRate,
    };
  }

  /**
   * Returns current configuration. Can be from user-supplied defaults, local
   * cache, or remote configuration.
   */
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
