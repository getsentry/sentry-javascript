import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoader } from '@sentry-internal/rollup-utils';

export default [...makeNPMConfigVariants(makeBaseNPMConfig()), makeOtelLoader('./build/register.mjs')];
