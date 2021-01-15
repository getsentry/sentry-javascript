import { Package } from './package';

/**
 * TODO: Remove `applyIntegrationsMetadata` method from the core and rely on the API instead, once we move to envelopes for all types of requests.
 * TODO: Consider renaming to `SdkMetadata`.
 */
export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: Package[];
}
