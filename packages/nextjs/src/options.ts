import { BrowserOptions, SDK_VERSION } from '@sentry/browser';
import { NodeOptions } from '@sentry/node';
import { Options, SdkInfo } from '@sentry/types';

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
  private _packageName: string;

  constructor(options: NextjsOptions, packageName: string) {
    this._options = options;
    this._packageName = packageName;
  }

  public addSdkMetadata(): void {
    this._options._metadata = this._options._metadata || {};
    this._options._metadata.sdk = this._getSdkInfo();
  }

  private _getSdkInfo(): SdkInfo {
    return {
      name: SDK_NAME,
      version: SDK_VERSION,
      packages: [
        {
          name: this._getPackageName(),
          version: SDK_VERSION,
        },
      ],
    };
  }

  private _getPackageName(): string {
    return PACKAGE_NAME_PREFIX + this._packageName;
  }
}
