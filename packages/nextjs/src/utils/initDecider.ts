import { NextjsOptions } from './nextjsOptions';

export class InitDecider {
  private _options: NextjsOptions;

  constructor(options: NextjsOptions) {
    this._options = options;
  }

  public shouldInitSentry(): boolean {
    if (this._options) {
      // noop
    }
    return this._isInProduction();
  }

  private _isInProduction(): boolean {
    return process.env.NODE_ENV !== undefined && process.env.NODE_ENV === 'production';
  }
}
