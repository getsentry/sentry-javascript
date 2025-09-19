export interface GrowthBook {
  isOn(this: GrowthBook, featureKey: string): boolean;
  getFeatureValue(this: GrowthBook, featureKey: string, defaultValue: unknown): unknown;
}

// We only depend on the surface we wrap; constructor args are irrelevant here.
export type GrowthBookClass = new (...args: unknown[]) => GrowthBook;
