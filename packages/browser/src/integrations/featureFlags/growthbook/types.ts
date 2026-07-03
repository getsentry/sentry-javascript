export interface GrowthBook {
  isOn(this: GrowthBook, featureKey: string, ...rest: unknown[]): boolean;
  getFeatureValue(this: GrowthBook, featureKey: string, defaultValue: unknown, ...rest: unknown[]): unknown;
}

// We only depend on the surface we wrap; constructor args are irrelevant here.
// `unknown[]` is contravariantly incompatible with real constructors (e.g. GrowthBook's), so use `any[]`.
// oxlint-disable-next-line typescript-eslint/no-explicit-any
export type GrowthBookClass = new (...args: any[]) => GrowthBook;
