import { NextjsOptions } from './nextjsOptions';

export class InitDecider {
  private _options: NextjsOptions;

  constructor(options: NextjsOptions) {
    this._options = options;
  }

  /**
   * Returns a boolean representing whether the NextJS SDK should be initialised.
   *
   * The SDK should be initialised if the `dev` option is set to true.
   * `dev` is optional, so if it isn't set or is set to false, the SDK will only
   * be initialised in a production environment.
   */
  public shouldInitSentry(): boolean {
    if (this._isEnabledInDev() || this._isProdEnv()) {
      return true;
    }
    return false;
  }

  /**
   * Returns true if the option `dev` is true, and false otherwise.
   */
  private _isEnabledInDev(): boolean {
    return this._options.dev || false;
  }

  /**
   * Returns whether the environment is a production environment.
   */
  private _isProdEnv(): boolean {
    return process.env.NODE_ENV !== undefined && process.env.NODE_ENV === 'production';
  }
}
