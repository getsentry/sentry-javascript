import type { Package } from './package';

export interface SdkInfo {
  name?: string;
  version?: string;
  integrations?: string[];
  packages?: Package[];
}
