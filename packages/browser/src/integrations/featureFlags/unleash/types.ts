export interface IVariant {
  name: string;
  enabled: boolean;
  feature_enabled?: boolean;
  payload?: {
      type: string;
      value: string;
  };
}

export interface UnleashClient {
  isEnabled(this: UnleashClient, featureName: string): boolean;
  getVariant(this: UnleashClient, featureName: string): IVariant;
}

export type UnleashClientClass = new (...args: unknown[]) => UnleashClient;
