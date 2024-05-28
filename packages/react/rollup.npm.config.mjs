import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    esModuleInterop: true,
    packageSpecificConfig: {
      external: ['react', 'react/jsx-runtime'],
    },
    sucrase: {
      jsxRuntime: 'automatic', // React 19 emits a warning if we don't use the newer jsx transform: https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
      production: true, // This is needed so that sucrase uses the production jsx runtime (ie `import { jsx } from 'react/jsx-runtime'` instead of `import { jsxDEV as _jsxDEV } from 'react/jsx-dev-runtime'`)
    },
  }),
);
