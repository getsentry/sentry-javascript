import type { SdkInfo } from './sdkinfo';

export interface SdkMetadata {
  sdk?: SdkInfo;
  /** Option keys explicitly supplied to the outermost init call. */
  optionsSetByUser?: string[];
}
