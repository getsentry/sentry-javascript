// `@mastra/core` declares `engines.node >= 22.13`, so it can't live in the package's root
// `devDependencies` (that would break `yarn install` on the 20.19 CI matrix). Install it per-suite
// instead, guarded by the `min: 22` skip below.
export const MASTRA_DEPENDENCIES = {
  additionalDependencies: {
    '@mastra/core': '1.63.2',
    '@mastra/observability': '1.17.4',
  },
};

// The `executeWithContext` active-context bridge lives in `@mastra/core`'s stable
// `observability/context-storage` entry; pin a version that ships it.
export const MASTRA_NESTING_DEPENDENCIES = {
  additionalDependencies: {
    '@mastra/core': '1.65.0',
    '@mastra/observability': '1.17.6',
  },
};

// `Classifier` (the `@mastra/core/classifier` entry) ships in newer `@mastra/core` releases only.
export const MASTRA_CLASSIFIER_DEPENDENCIES = {
  additionalDependencies: {
    '@mastra/core': '1.74.0',
    '@mastra/observability': '1.18.3',
  },
};
