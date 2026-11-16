import { describe } from 'vitest';
import { supports } from '../../../../../utils';
import { registerMastraObservabilityTests } from '../../suite';

describe.runIf(supports({ min: 22 }))('Mastra integration', registerMastraObservabilityTests);
