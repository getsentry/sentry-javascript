import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [...makeNPMConfigVariants(makeBaseNPMConfig()), ...makeOtelLoaders('./build', 'sentry-node')];
