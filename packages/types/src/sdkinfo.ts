interface Package {
  name: string;
  version: string;
}

/** JSDoc */
export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: Package[];
}
