import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import alias from '@rollup/plugin-alias';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // set preserveModules to false because for Replay we actually want
        // to bundle everything into one file.
        preserveModules: false,
      },
    },
    plugins: ['@babel/transform-react-jsx', { pragma: 'h' },
      alias({
        entries: [
          { find: 'react', replacement: 'preact/compat' },
          { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
          { find: 'react-dom', replacement: 'preact/compat' },
          { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' }
        ]
      })
    ],
  }),
);
