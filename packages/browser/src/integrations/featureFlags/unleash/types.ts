export type Variant = {
  variantName: string;
  enabled: boolean;
  payload?: object; // TODO:
  // TODO:
}

export interface UnleashClient {
  isEnabled(featureName: string): boolean;
  getVariant(featureName: string): Variant;
}
