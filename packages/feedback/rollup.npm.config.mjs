import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
      },
    },
    sucrase: {
      // The feedback widget is using preact so we need different pragmas and jsx runtimes
      jsxPragma: 'h',
      jsxFragmentPragma: 'Fragment',
      jsxRuntime: 'classic',
      production: true,
    },
  }),
);
