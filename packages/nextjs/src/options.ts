import { BrowserOptions, SDK_VERSION } from '@sentry/browser';
import { NodeOptions } from '@sentry/node';
import { Options, Package, SdkInfo } from '@sentry/types';

const SDK_NAME = 'sentry.javascript.nextjs';
const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

export interface NextjsOptions extends Options, BrowserOptions, NodeOptions {
  // TODO: options for NextJS
}

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 */
export class MetadataBuilder {
  private _options: NextjsOptions;
  private _packageNames: string[];

  constructor(options: NextjsOptions, packages: string[]) {
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
