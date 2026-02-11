import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      external: ['react', 'react/jsx-runtime'],
    },
    sucrase: {
      // React 19 emits a warning if we don't use the newer jsx transform: https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
      // but this breaks react 17, so we keep it at `classic` for now
      jsxRuntime: 'classic',
      production: true, // This is needed so that sucrase uses the production jsx runtime (ie `import { jsx } from 'react/jsx-runtime'` instead of `import { jsxDEV as _jsxDEV } from 'react/jsx-dev-runtime'`)
    },
  }),
);
