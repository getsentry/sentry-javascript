import { Package } from './package';

export interface SdkInfo {
  name?: string;
  version?: string;
  integrations?: string[];
  packages?: Package[];
  // Either 'CDN', 'npm', or 'lambdaLayer'. This is hardcoded as part of our build process.
  source?: string;
}
