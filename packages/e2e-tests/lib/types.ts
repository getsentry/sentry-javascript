export type TestResult = {
  testName: string;
  result: 'PASS' | 'FAIL' | 'TIMEOUT';
};

type DependencyOverrides = Record<string, string>;

export interface TestDef {
  testName: string;
  testCommand: string;
  timeoutSeconds?: number;
}

export interface RecipeInput {
  testApplicationName: string;
  buildCommand?: string;
  buildAssertionCommand?: string;
  buildTimeoutSeconds?: number;
  testTimeoutSeconds?: number;
  tests: TestDef[];
  versions?: { dependencyOverrides: DependencyOverrides }[];
  canaryVersions?: { dependencyOverrides: DependencyOverrides }[];
}

export interface Recipe {
  path: string;
  testApplicationName: string;
  buildCommand?: string;
  buildAssertionCommand?: string;
  buildTimeoutSeconds?: number;
  testTimeoutSeconds?: number;
  tests: TestDef[];
  versions: { dependencyOverrides: DependencyOverrides }[];
}

export interface RecipeInstance {
  label: string;
  recipe: Recipe;
  dependencyOverrides?: DependencyOverrides;
  portModulo: number;
  portGap: number;
}

export interface RecipeTestResult extends RecipeInstance {
  buildFailed: boolean;
  testFailed: boolean;
  tests: TestResult[];
}

export type Env = Record<string, string | undefined>;
