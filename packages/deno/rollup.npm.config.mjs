import { defineConfig } from 'rolldown';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const orchestrionRuntimeHooks = [
  defineConfig({
    input: 'src/import.mjs',
    external: /.*/,
    output: { format: 'esm', file: 'build/import.mjs' },
  }),
];

export default [...orchestrionRuntimeHooks, ...makeNPMConfigVariants(makeBaseNPMConfig(), { emitCjs: false })];
