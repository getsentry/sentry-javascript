export interface GrowthBook {
  isOn(this: GrowthBook, featureKey: string, ...rest: unknown[]): boolean;
  getFeatureValue(this: GrowthBook, featureKey: string, defaultValue: unknown, ...rest: unknown[]): unknown;
}

// We only depend on the surface we wrap, so accept any class whose prototype matches.
export type GrowthBookClass = { prototype: GrowthBook };
