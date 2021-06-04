import { SDK_VERSION } from '@sentry/core';
import { Package, SdkInfo } from '@sentry/types';

import { NextjsOptions } from './nextjsOptions';

export const SDK_NAME = 'sentry.javascript.nextjs';
export const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 */
export class MetadataBuilder {
  private _options: NextjsOptions;
  private _packageNames: string[];

  public constructor(options: NextjsOptions, packages: string[]) {
    this._options = options;
    this._packageNames = packages;
  }

  public addSdkMetadata(): void {
    this._options._metadata = this._options._metadata || {};
    this._options._metadata.sdk = this._getSdkInfo();
  }

  private _getSdkInfo(): SdkInfo {
    return {
      name: SDK_NAME,
      version: SDK_VERSION,
      packages: this._getPackages(),
    };
  }

  private _getPackages(): Package[] {
    return this._packageNames.map((pkgName: string) => {
      return {
        name: PACKAGE_NAME_PREFIX + pkgName,
        version: SDK_VERSION,
      };
    });
  }
}
