import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

export default [...makeNPMConfigVariants(makeBaseNPMConfig()), ...makeOrchestrionLoader('./build')];
