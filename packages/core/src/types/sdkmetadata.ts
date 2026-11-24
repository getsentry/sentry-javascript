import type { SdkInfo } from './sdkinfo';

export interface SdkMetadata {
  sdk?: SdkInfo;
  /** Option keys explicitly supplied to the outermost init call. */
  optionsSetByUser?: string[];
  /** Names of the integrations the user added in the outermost init call. */
  integrationsSetByUser?: string[];
  /** Sorted names of the default integrations an `integrations` function dropped. */
  removedDefaultIntegrations?: string[];
}
